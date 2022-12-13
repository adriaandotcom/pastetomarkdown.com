(() => {
  const pasteElement = document.getElementById("paste");
  const markdownElement = document.getElementById("markdown");
  const listRegex = /^(\s)*((\d+\.)(\s)|(-|\*)|(\[\^(\d|[a-z0-9-_])+\]:))/;

  const search = new URLSearchParams(location.search);
  const cleanup = search.get("cleanup") !== "no";

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
    reader.onload = (event) => {
      convert(event.target.result);
    };
    reader.readAsText(file);
  });

  // ondragenter
  dropbox.addEventListener("dragenter", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropbox.classList.add("active");
  });

  // ondragover
  dropbox.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  // ondragleave
  dropbox.addEventListener("dragleave", (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropbox.classList.remove("active");
  });

  pasteElement.addEventListener("paste", async (event) => {
    setTimeout(() => {
      const html = pasteElement.textContent.trim();
      convert(html);
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

    html = pasteElement.innerHTML.replace(
      /(<span style="[^"]*font-weight:[ ]*(?:bold|[6-9]00)[^"]*">)(.*?)(<\/span>)/gi,
      "$1<strong>$2</strong>$3"
    );

    let markdown = turndownService.turndown(html);

    // Replace the links "https://www.google.com/url?q=https://example.com&sa=D&source=...&ust=...&usg=.../" and keep the q parameter
    markdown = markdown.replace(
      /https:\/\/www\.google\.com\/url\?q=(https?:\/\/[^&]+)&[^\)]*/g,
      "$1"
    );

    // Remove backslashes in [\[6\]] with [^6]
    markdown = markdown.replace(/\[\\\[(\d+)\\\]\](\([^)]+\))?/g, "[^$1]");

    // Get a list of all accurences of [^1] and [^2] etc.
    const footnoteMatches = (
      markdown.match(/\[\^(\d|[a-z0-9-_]+)+\]/g) || []
    ).map((note) => note.match(/(\d|[a-z0-9-_]+)/)[0]);

    // Rrplace last occurence of [^1] with [^1]:
    footnoteMatches.forEach((match) => {
      // Get all matches of [^1]
      // const matches = markdown.match(new RegExp(`\\[\\^${match}\\]`, "g"));

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

    const allLines = markdown
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
      }, []);

    markdown = cleanup ? allLines.join("\n") : markdown;
    markdown = markdown.trim();

    markdownElement.style.display = "block";
    markdownElement.innerHTML = markdown + "\n";

    markdownElement.focus();
    markdownElement.select();

    console.log("html:");
    console.log(html);
    console.log();
    console.log("markdown:");
    console.log(markdown);

    document.body.classList.add("has-markdown");
  };
})();
