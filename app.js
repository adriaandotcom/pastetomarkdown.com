(() => {
  const pasteElement = document.getElementById("paste");
  const markdownElement = document.getElementById("markdown");
  const commandElement = document.getElementById("cmd-key");
  const listRegex = /^(\s)*((\d+\.)(\s)|(-|\*)|(\[\^(\d|[a-z0-9-_])+\]:))/;
  const isMac = navigator.userAgent.includes("Mac");

  const search = new URLSearchParams(location.search);
  const cleanup = !search.has("cleanup") || search.get("cleanup") === "yes";

  if (commandElement && !isMac) {
    commandElement.innerHTML = "CTRL";
  }

  const turndownOptions = {
    headingStyle: "atx",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "_",
    strongDelimiter: "**",
    linkStyle: "inlined",
    linkReferenceStyle: "full",
  };

  const gfm = turndownPluginGfm.gfm;
  const turndownService = new TurndownService(turndownOptions);
  turndownService.use(gfm);

  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey) {
      if (String.fromCharCode(event.which).toLowerCase() === "v") {
        pasteElement.innerHTML = "";
        pasteElement.focus();
      }
    }
  });

  const dropbox = document.querySelector(".drop");

  dropbox.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();

    dropbox.classList.remove("active");

    const file = event.dataTransfer.files[0];
    const reader = new FileReader();
    reader.onload = (event) => convert(event.target.result);
    reader.readAsText(file);
  });

  dropbox.addEventListener("dragenter", () => {
    dropbox.classList.add("active");
  });

  // Prevent default behavior (Prevent file from being opened)
  dropbox.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  dropbox.addEventListener("dragleave", () => {
    dropbox.classList.remove("active");
  });

  pasteElement.addEventListener("paste", async (event) => {
    setTimeout(() => {
      convert(pasteElement.textContent.trim());
    }, 250);
  });

  const convert = (html) => {
    // Create a regex to check if text starts with <html> or <!DOCTYPE html>
    const regex = /^(\<\!DOCTYPE\ html\>|\<html\>)/;

    if (regex.test(html)) {
      const match = html.match(
        /<body[^>]*>([^<]*(?:(?!<\/?body)<[^<]*)*)<\/body\s*>/i
      );
      if (match[1]) pasteElement.innerHTML = match[1];
    }

    // Surround ul with a li element, it's what Google Docs fails to do
    pasteElement.querySelectorAll("li + ol, li + ul").forEach((ul) => {
      if (!cleanup) return;

      // Insert ul inside the previous li
      const li = ul.previousElementSibling;
      li.appendChild(ul);
    });

    // Another bug in Google Docs, it fails to indent lists properly
    pasteElement
      .querySelectorAll(
        'ul[class*="lst-"][class*="-0"] + ul[class*="lst-"][class*="-1"], ol[class*="lst-"][class*="-0"] + ol[class*="lst-"][class*="-1"]'
      )
      .forEach((currentUl) => {
        if (!cleanup) return;

        // Insert ul inside the previous li
        const previousUl = currentUl.previousElementSibling;

        // Get the last li of the previous ul
        const li = previousUl.lastElementChild;

        li.appendChild(currentUl);
      });

    html = pasteElement.innerHTML.replace(
      /(<span style="[^"]*font-weight:[ ]*(?:bold|[6-9]00)[^"]*">)(.*?)(<\/span>)/gi,
      "$1<strong>$2</strong>$3"
    );

    const untouchedMarkdown = turndownService.turndown(html);

    let markdown = untouchedMarkdown;

    // https://www.google.com/url?q=https://www.simpleanalytics.com/blog/gdpr-consent-101?utm_source%3Dlala%26extra%3D123%23hash&sa=D&source=editors&ust=1671017642274294&usg=AOvVaw2EhgyBa4LXjOv8Y6oX7sPk
    // Replace the links "https://www.google.com/url?q=https://example.com&sa=D&source=...&ust=...&usg=.../" and keep the q parameter
    markdown = markdown.replace(
      /https:\/\/www\.google\.com\/url\?q=(https?:\/\/[^&]+)(&[^\)]*)?/g,
      (fullUrl, redirectUrl) => {
        if (!redirectUrl) return fullUrl;
        if (!/\?/.test(redirectUrl)) return redirectUrl;

        const [url, query] = redirectUrl.split("?");
        const [search, hash] = decodeURIComponent(query).split("#");
        const newUrl = new URL(url);
        newUrl.search = new URLSearchParams(search);
        if (hash) newUrl.hash = hash;
        return newUrl.toString();
      }
    );

    // Remove backslashes in [\[6\]] with [^6]
    markdown = markdown.replace(/\[\\\[(\d+)\\\]\](\([^)]+\))?/g, "[^$1]");

    // Get a list of all accurences of [^1] and [^2] etc.
    const footnoteMatches = (
      markdown.match(/\[\^(\d|[a-z0-9-_]+)+\]/g) || []
    ).map((note) => note.match(/(\d|[a-z0-9-_]+)/)[0]);

    // Replace last occurence of [^1] with [^1]:
    footnoteMatches.forEach((match) => {
      // Replace only the last occurence of [^1] with [^1]: within markdown
      markdown = markdown.replace(
        new RegExp(`\\[\\^${match}\\]`, "g"),
        (match, offset) => {
          const index = markdown.indexOf(match, offset);
          const lastIndex = markdown.lastIndexOf(match);

          if (index === lastIndex) {
            return match + ":";
          }

          return match;
        }
      );
    });

    // Replace [^1]:: with [^1]:
    markdown = markdown.replace(/\[\^(\d|[a-z0-9-_])+\]:+/g, "[^$1]:");

    // This mostly fixed the double new lines between list items
    markdown = markdown
      .split("\n")
      // Trim spaces on the right of the line
      .map((line) => line.replace(/\s+$/, ""))
      .join("\n")
      .replace(/\n\n(\n)+/g, "\n\n")
      .split("\n")
      .reduce((lines, line) => {
        // If we can't look back far enough, just return the line
        if (lines.length <= 2) return [...lines, line];

        // Test if line starts with a number followed by a dot
        const firstBack = lines[lines.length - 1];
        const secondBack = lines[lines.length - 2];

        // Return when the previous line is not empty
        if (firstBack !== "") return [...lines, line];

        // Check if two list items are separated by a new line
        if (
          listRegex.test(line) &&
          firstBack === "" &&
          listRegex.test(secondBack) &&
          // When the line is a horizontal rule * * * or ***
          !/^\*\*/.test(secondBack.replace(/\s/g, ""))
        ) {
          // Remove last line
          lines.pop();
        }

        return [...lines, line];
      }, [])
      .join("\n");

    if (!cleanup) markdown = untouchedMarkdown;
    markdown = markdown.trim();

    markdownElement.style.display = "block";
    markdownElement.innerHTML = markdown + "\n";

    markdownElement.focus();
    markdownElement.select();

    console.log("html:");
    console.log(html);
    console.log();

    if (cleanup) console.log("markdown (clean):");
    else console.log("markdown:");
    console.log(markdown);
    console.log();

    if (cleanup) {
      console.log("markdown (raw):");
      console.log(untouchedMarkdown);
      console.log();
    }

    console.log("cleanup: " + (cleanup ? "yes" : "no"));

    document.body.classList.add("has-markdown");
  };
})();
