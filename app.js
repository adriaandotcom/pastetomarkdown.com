(() => {
  const pasteElement = document.getElementById("paste");
  const markdownElement = document.getElementById("markdown");
  const listRegex = /^(\s)*((\d+\.)(\s)|(-|\*))/;

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

  pasteElement.addEventListener("paste", (event) => {
    setTimeout(() => {
      // Surround ul with a li element, it's what Google Docs fails to do
      pasteElement.querySelectorAll("li + ol, li + ul").forEach((ul) => {
        // Insert ul inside the previous li
        const li = ul.previousElementSibling;
        li.appendChild(ul);
      });

      const html = pasteElement.innerHTML.replace(
        /(<span style="[^"]*font-weight:[ ]*(?:bold|[6-9]00)[^"]*">)(.*?)(<\/span>)/gi,
        "$1<strong>$2</strong>$3"
      );

      let markdown = turndownService.turndown(html);

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
            listRegex.test(secondBack)
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
    }, 250);
  });
})();
