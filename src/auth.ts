import * as OTPAuth from "otpauth";
import qrcode, { create } from "qrcode";
import { ctx } from "./index";

const defaultUsername = "admin";
const defaultPassword = "password";

let tokens: {name: string, token: string, expires: Date}[] = []

type User = {
    name: string,
    password: string,
    secret: string,
    admin: boolean
}

/**
 * Creates users table and admin user if they don't exist
 * 
 * @returns null
 */
export function initAuth(){
    ctx.db.query(`CREATE TABLE IF NOT EXISTS users (
        name TEXT PRIMARY KEY,
        password TEXT,
        secret TEXT,
        admin BOOLEAN,
        active BOOLEAN,
        lastLogin INTEGER
    )`).run();

    // Create an admin user if there are no users
    const users = ctx.db.query("SELECT 1 FROM users").get();
    if(users) {
        console.log("Existing users found. Skipping admin creation."); 
        return;
    }
    const secret = new OTPAuth.Secret();
    ctx.db.query("INSERT INTO users (name, password, secret, admin) VALUES (?1, ?2, ?3, true)").run(defaultUsername, defaultPassword, secret.base32);
    
    const authURI = OTPAuth.URI.stringify(new OTPAuth.TOTP({
        issuer: "shortlinks",
        label: defaultUsername,
        secret: secret,
    }))

    // Export the admin secret to a file
    Bun.write(Bun.file("./temp/admin.secret"), authURI);

    // Export the admin secret to a qr code image file
    qrcode.toFile("./temp/admin.secret.png", authURI);

    // Print the admin secret qr code to the console
    qrcode.toString(authURI, {type:'terminal', small: true}, function (err, url) {
        console.log("\nAdmin account created. Secret URL and QR code available in ./temp\n");
        console.log("You can also scan here: \n")
        console.log(authURI + "\n");
        console.log(url);
    })
}

/**
 * Creates a new user
 * 
 * @param name User name
 * @param password User Password
 * @param admin Is User Admin
 * @returns 
 */
function createUser(name: string, password: string, admin: boolean): string {
    const secret = new OTPAuth.Secret();
    ctx.db.query("INSERT INTO users (name, password, secret, admin) VALUES (?1, ?2, ?3, ?4)").run(name, password, secret.base32, admin);
    return secret.base32;
}

/**
 * Checks password so frontend can continue to OTP
 * 
 * @param req HTTP Request to check password
 * @returns 
 */
export async function checkPassword(req: Request){
    const data = await req.json();
    const user = ctx.db.query("SELECT * FROM users WHERE name=?").get(data.username) as User;
    if(!user)
        return new Response(JSON.stringify(false), {status: 401});
    return user.password === data.password?
        new Response(JSON.stringify(true), {status: 200}) : 
        new Response(JSON.stringify(false), {status: 401});
}

/**
 * Resolve /login post request
 * 
 * @param req HTTP Request to log in
 * @returns HTTP Response
 */
export async function attemptLogin(req: Request){
    let data = await req.json();
    if(!data.username || !data.password || !data.otp)
        return new Response("Missing username, password, or OTP", {status: 400});
    const token = loginUser(data.username, data.password, data.otp);
    if(!token)
        return new Response("Invalid username, password, or OTP", {status: 401});
    let headers = new Headers(req.headers);
    /** Commented out while working localhost
    headers.append("Set-Cookie", `token=${token}; 
        Path=/; SameSite=strict; HttpOnly; Secure; 
        Max-Age=${ctx.config.sessionLifetime}; Domain=${ctx.config.domain}`.replace(/\s/g, ""));
    headers.append("Set-Cookie", `username=${data.username}; 
        Path=/; SameSite=strict; HttpOnly; Secure; 
        Max-Age=${ctx.config.sessionLifetime}; Domain=${ctx.config.domain}`.replace(/\s/g, ""));
    */
    headers.append("Set-Cookie", `token=${token}; 
        Path=/; SameSite=strict; HttpOnly; Secure; 
        Max-Age=${ctx.config.sessionLifetime};`.replace(/\s/g, ""));
    headers.append("Set-Cookie", `username=${data.username}; 
        Path=/; SameSite=strict; HttpOnly; Secure; 
        Max-Age=${ctx.config.sessionLifetime};`.replace(/\s/g, ""));
    return new Response(null, {status: 200, headers});
}

/**
 * Validates credentials and creates a session token
 * 
 * @param name User name
 * @param password User Password
 * @param otp TOTP generated code
 * @returns 
 */
export function loginUser(name: string, password: string, otp: string){
    const user = ctx.db.query("SELECT * FROM users WHERE name=?").get(name) as User;
    if(!user) return false;
    if(user.password !== password) return false;
    let totp = new OTPAuth.TOTP({
        issuer: "shortlinks",
        label: name,
        secret: OTPAuth.Secret.fromBase32(user.secret)
    });
    if(totp.validate({token: otp}) == null) return false;
    return createToken(name);
}

/**
 * Checks for auth token
 * @param req HTTP Request
 * @returns false if not authenticated, username if so
 */
export function isAuthenticated(req: Request){
    const cookies = parseCookies(req.headers.get("cookie"));
    if(!cookies.token) return false;
    const username = verifyToken(cookies.token);
    // Someday we'll have error handling...
    if(cookies.username != username) return false;
    return username
}

/**
 * Checks if user is admin
 * @param username User name
 * @returns true if admin, false if not
 */
export function isAdmin(username: string){
    const user = ctx.db.query("SELECT * FROM users WHERE name=?").get(username) as User;
    if(!user) return false;
    return user.admin;
}

/**
 * Creates a session token, expires in 24 hours
 * @param name User name to create token for
 * @returns The new session token
 */
function createToken(name: string): string{
    const token = crypto.randomUUID();
    const expires = new Date();
    expires.setSeconds(expires.getSeconds() + ctx.config.sessionLifetime);
    tokens.push({name, token, expires});
    return token as string;
}

/**
 * Checks to see if session token is valid
 * @param token Session token
 * @returns Validity of the token
 */
function verifyToken(token: string){
    const tokenData = tokens.find(t => t.token === token);
    if(!tokenData) return false;
    if(tokenData.expires < new Date()){
        removeToken(token);
        return false;
    }
    return tokenData.name;
}

/**
 * Removes a session token
 * @param token Session token
 */
function removeToken(token: string){
    tokens = tokens.filter(t => t.token !== token);
}

/**
 * Remove all session tokens for a user
 * @param name User name
 */
export function logoutUser(name: string){
    tokens = tokens.filter(t => t.name !== name);
}

// Helper function to parse cookies
function parseCookies(cookieHeader?: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split("; ").map((c) => {
      const [key, value] = c.split("=");
      return [key, decodeURIComponent(value)];
    })
  );
}

export function getAccounts(user: string, page: number){
    return ctx.db.query("SELECT * FROM users ORDER BY name DESC LIMIT ?1 OFFSET ?2").all(5, page * 5) as User[];
}


export async function deleteAccount(req: Request){
    const username = new URL(req.url).pathname.split("/")[2];
    if(!isAuthenticated(req))
        return new Response("Unauthorized: Deleting an account requires authentication", {status: 401});
    if(!isAdmin(isAuthenticated(req) || ""))
        return new Response("Unauthorized: Deleting an account requires admin privileges", {status: 401});
    if(!username)
        return new Response("Missing username", {status: 400});
    // Check if user exists
    const user = ctx.db.query("SELECT * FROM users WHERE name=?").get(username) as User;
    if(!user) 
        return new Response("User not found", {status: 404});
    // Cannot delete last admin
    const adminCount = ctx.db.query("SELECT COUNT(*) AS count FROM users WHERE admin=true").get() as {count: number};
    if(user.admin && adminCount.count <= 1) 
        return new Response("Cannot delete last admin user", {status: 400});
    // Checks pass
    ctx.db.query("DELETE FROM users WHERE name=?").run(user.name);
    return new Response(null, {status: 200});
}

export async function createAccount(req: Request): Promise<Response> {
    if(!isAdmin(isAuthenticated(req) || ""))
        return new Response("Unauthorized: Creating an account requires admin privileges", {status: 401});
    const data = await req.formData()
    const body = {
        name: data.get("name") as string,
        password: data.get("password") as string,
        admin: data.get("admin") == "on"
    };
    if(!body.name || !body.password)
        return new Response("Missing required fields", {status: 400});
    if(ctx.db.query("SELECT * FROM users WHERE name=?").get(body.name) as User)
        return new Response("User already exists", {status: 400});
    createUser(body.name, body.password, false);
    return new Response(null, {status: 200});
}