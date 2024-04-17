# Shortlinks

A simple Bun webserver for creating and utilizing url redirects with a PicoCSS driven web front end. Best if used with a short domain name!

<p align="center">
  <table align="center"><tbody><td align="center">
    <p align="center">If you are looking for Shortlinks CLI</p> 
    <a href="https://github.com/VVill-ga/shortlinks-cli">
      <img alt="Shortlinks CLI" src="https://img.shields.io/badge/Click%20Here-blue?style=for-the-badge">
    </a>
  </td></tbody></table>
</p>

### Testing
```bash
bun i          # Installs node modules
bun run host   # Hosts shortlinks server on port 7000
bun run clean  # Deletes links.db
```

### Production (Systemd)
```bash
# edit shortlinks.service.template, replacing all <TOKENS>
mv shortlinks.service.template /usr/lib/systemd/system/shortlinks.service
sudo systemctl daemon-reload
sudo systemctl enable shortlinks
sudo systemctl start shortlinks
```

:exclamation: To find the absolute path to Bun, run: `which bun`

Note on that variable. By default, Bun installs to a directory in the user's
home directory, and not on the default `$PATH`. For this reason we cannot just
run `bun` through systemd (as it would not be on `$PATH` and would therefore 
not be found). You could alternatively modify this to be `bash "bun run host"`
which would load in the users `.bashrc` and add bun to the `$PATH`.

## API

### Creating Shortlink: /
```json
"method": "POST",
"body": {
    "link": "{Link to be directed to}",
    "requestedCode": "{OPTIONAL: Path you would like to direct to the link}"
}
```

### Responses
- **200**: `"{Shortlink code (text after '/')}"`
- **400**: `"Missing Destination Link" || "Error Parsing JSON"`
- **409**: `"Request for specific path denied"`

## Acknowledgements

[Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

[Pico CSS](https://picocss.com) is a Minimal CSS Framework for Semantic HTML.