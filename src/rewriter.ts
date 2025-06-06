import { getAccounts, isAdmin, isAuthenticated } from "./auth"
import { ctx } from "./index"
import { getCount, getLinks } from "./links"

const files = {
    template: await Bun.file("./public/index.html").text(),
    tabs: await Bun.file("./public/x/tabs.html").text(),
    index: await Bun.file("./public/x/index.html").text(),
    links: await Bun.file("./public/x/links.html").text(),
    accounts: await Bun.file("./public/x/accounts.html").text(),
}

let rewriterArgs = {
    admin: false,
    user: "",
    page: "index",
    paginate: 0,
    totalPages: 1,
}
const rewriters = {
    tabs: new HTMLRewriter()
        .on("li", {
            element(el) {
                if(el.getAttribute("id") == rewriterArgs.page) {
                    el.setAttribute("aria-selected", "true")
                }
                if(el.getAttribute("class") == "admin-only" && !rewriterArgs.admin) {
                    el.remove()
                }
            }
        }),
    template: new HTMLRewriter()
        .on("main", {
            element(el) {
                el.append(rewriters.tabs.transform(files.tabs), {html: true})
                el.append(rewriters[rewriterArgs.page].transform(files[rewriterArgs.page]), {html: true})
            }
        }),
    index: new HTMLRewriter(),
    links: new HTMLRewriter()
        .on("tbody", {
            element(el) {
                let links = getLinks(rewriterArgs.user, rewriterArgs.paginate);
                links.map((link) => {
                    el.append(`<tr id="link-${link.code}">
                        <td><a href="https://${ctx.config.domain}/${link.code}">${link.code}</a></td>
                        <td style="line-break: anywhere;">${link.link}</td>
                        <td>${link.visits}</td>
                        <td>${link.expires ? new Date(link.expires * 1000).toLocaleString() : "Never"}</td>
                        <td nowrap>
                            <u aria-controls="edit-modal" onclick="toggleEditModal(event)" data-link="/${link.code}" data-url="${link.link}">Edit</u>
                            <span class="separator">|</span>
                            <u aria-controls="delete-modal" onclick="toggleDeleteModal(event)" data-link="/${link.code}" data-url="${link.link}">Delete</u>
                        </td>
                    </tr>`, {html: true})
                })
            }
        }),
    accounts: new HTMLRewriter()
        .on("tbody", {
            element(el) {
                const users = getAccounts(rewriterArgs.user, rewriterArgs.paginate);
                users.map((user) => {
                    el.append(`<tr id="user-${user.name}">
                        <td>${user.name}</td>
                        <td>${user.admin ? "Yes" : "No"}</td>
                        <td>
                            <u aria-controls="delete-modal" onclick="toggleDeleteModal(event)" data-name="${user.name}">Delete</u>
                        </td>
                    </tr>`, {html: true})
                })
            }
        }),
}

export const index = (r: Request) => {
    // Always is authenticated
    rewriterArgs.admin = isAdmin(isAuthenticated(r) || "")
    rewriterArgs.page = "index"
    return rewriters.template.transform(files.template)
}

export const links = (r: Request) => {
    // Always is authenticated
    rewriterArgs.admin = isAdmin(isAuthenticated(r) || "")
    rewriterArgs.user = isAuthenticated(r) || ""
    rewriterArgs.paginate = parseInt(new URL(r.url).searchParams.get("page") || "0")
    rewriterArgs.totalPages = Math.ceil(getCount(rewriterArgs.user) / 5)
    rewriterArgs.page = "links"
    return rewriters.template.transform(files.template)
}

export const accounts = (r: Request) => {
    // Always is authenticated
    rewriterArgs.admin = isAdmin(isAuthenticated(r) || "")
    rewriterArgs.user = isAuthenticated(r) || ""
    rewriterArgs.paginate = parseInt(new URL(r.url).searchParams.get("page") || "0")
    rewriterArgs.totalPages = Math.ceil(getCount(rewriterArgs.user) / 5)
    rewriterArgs.page = "accounts"
    return rewriters.template.transform(files.template)
}

export default {
    index,
    links,
    accounts,
}