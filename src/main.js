import plugin from "../plugin.json";
import { isText } from "istextorbinary";

class AcodePlugin {
    baseUrl = "";
    page = null;

    sidebarApps = null;
    fileBrowser = null;
    commands = null;
    fs = null;

    selectedFolder = null;
    scannedFiles = [];
    binaryFiles = [];
    firstFileContent = null;

    selectedPaths = new Set();

    launcherInstalled = false;
    launcherReady = false;
    launcherSelected = false;
    selectedDuringInstall = false;

    handlePageHide = () => {
        this.launcherSelected = false;
        this.resetLauncher();
    };

    async init(baseUrl, page) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

        this.page = page;

        this.sidebarApps = acode.require("sidebarApps");
        this.fileBrowser = acode.require("fileBrowser");
        this.commands = acode.require("commands");
        this.fs = acode.require("fs");

        if (
            !this.page ||
            !this.page.body ||
            typeof this.page.show !== "function" ||
            typeof this.page.hide !== "function" ||
            typeof this.page.on !== "function" ||
            typeof this.page.off !== "function"
        ) {
            throw new Error("Code Dump requires Acode's supplied plugin page.");
        }

        if (typeof this.fs !== "function") {
            throw new Error("Acode's filesystem API is unavailable.");
        }

        this.createPage();
        this.page.on("hide", this.handlePageHide);

        this.registerLauncher();
        this.registerCommand();
    }

    createPage() {
        this.page.classList.add("code-dump-page");
        this.page.settitle?.("Code Dump");

        const content = document.createElement("div");
        content.className = "code-dump";

        content.innerHTML = `
            <header class="code-dump__header">
                <h1>Code Dump mod.2</h1>
                <p>
                    Collect project source files into one text file.
                </p>
            </header>

            <section class="code-dump__section">
                <h2>Project Folder</h2>

                <p id="selected-folder">
                    No folder selected
                </p>

                <p class="code-dump__path-label">
                    Folder path
                </p>

                <code
                    id="selected-folder-path"
                    class="code-dump__path"
                >Select a project folder to begin.</code>

                <button
                    id="select-folder"
                    class="code-dump__button"
                    type="button"
                >
                    Select Project Folder
                </button>

                <button
                    id="scan-folder"
                    class="code-dump__button"
                    type="button"
                    disabled
                >
                    Scan Folder
                </button>
            </section>

            <section class="code-dump__section">
                <h2>Scan Options</h2>

                <div class="code-dump__extension-filter">
                    <label class="code-dump__all-label">
                        <input
                            id="all-extensions"
                            type="checkbox"
                        />
                        ALL — include every file type
                    </label>
                
                    <label class="code-dump__field">
                        File extensions
                        <input
                            id="file-extensions"
                            type="text"
                            placeholder=".js, .html, .css, .json"
                            value=".js, .html, .css, .json"
                        />
                    </label>
                </div>
            
                <label class="code-dump__field">
                    Excluded folders
                    <input
                        id="excluded-folders"
                        type="text"
                        value=".git, node_modules"
                        placeholder=".git, node_modules"
                    />
                </label>
            
                <label class="code-dump__field">
                    Excluded file names
                    <input
                        id="excluded-files"
                        type="text"
                        value=""
                        placeholder=".env, package-lock.json"
                    />
                </label>
            </section>
            
            <section class="code-dump__section">
                <h2>Folder Contents</h2>
            
                <p id="scan-status">
                    Select a folder, then scan it.
                </p>
            
                <pre
                    id="scan-results"
                    class="code-dump__results"
                >No scan results yet.</pre>
                
                <h3>First Text File — Content Test</h3>
                <pre id="file-preview">Scan a folder to preview its first text file.</pre>
            </section>
            <h3>Selected Files — Debug</h3>
            <pre id="selection-debug">No files selected.</pre>
        `;

        this.style = document.createElement("style");

        this.style.textContent = `
            .code-dump {
                box-sizing: border-box;
                width: 100%;
                min-height: 100%;
                padding: 20px;
                overflow-y: auto;
                color: var(--primary-text-color, #f2f4f8);
                font-family: sans-serif;
            }

            .code-dump__header {
                margin-bottom: 28px;
            }

            .code-dump__header h1 {
                margin: 0 0 8px;
                font-size: 26px;
            }

            .code-dump__header p,
            .code-dump__section p {
                line-height: 1.5;
                overflow-wrap: anywhere;
            }

            .code-dump__section {
                margin-bottom: 20px;
                padding: 16px;
                border: 1px solid
                    var(--border-color, #414754);
                border-radius: 12px;
            }

            .code-dump__section h2 {
                margin-top: 0;
                font-size: 18px;
            }

            .code-dump__path-label {
                margin-bottom: 6px;
                font-size: 13px;
                opacity: 0.7;
            }

            .code-dump__path {
                display: block;
                overflow-wrap: anywhere;
                white-space: pre-wrap;
                user-select: text;
            }

            .code-dump__button {
                box-sizing: border-box;
                width: 100%;
                min-height: 46px;
                margin-top: 12px;
                padding: 12px;
                border: 0;
                border-radius: 8px;
                background: var(--accent-color, #33b5e5);
                color: #10141b;
                font-size: 15px;
                font-weight: 600;
            }

            .code-dump__button:disabled {
                opacity: 0.45;
            }

            .code-dump__button:active:not(:disabled) {
                opacity: 0.8;
            }

            .code-dump__results {
                margin: 0;
                overflow-wrap: anywhere;
                white-space: pre-wrap;
                font-family: monospace;
                font-size: 13px;
                line-height: 1.6;
                user-select: text;
            }

            .code-dump__field {
                display: block;
                margin-top: 16px;
                font-size: 14px;
                font-weight: 600;
            }
            
            .code-dump__field input {
                box-sizing: border-box;
                display: block;
                width: 100%;
                min-height: 44px;
                margin-top: 8px;
                padding: 10px;
                border: 1px solid var(--border-color, #414754);
                border-radius: 8px;
                background: var(--secondary-background-color, #202530);
                color: var(--primary-text-color, #f2f4f8);
                font: inherit;
                font-size: 14px;
            }

            
            .code-dump__all-label {
                display: flex;
                align-items: center;
                gap: 10px;
                min-height: 44px;
                font-size: 14px;
                font-weight: 600;
            }
            
            .code-dump__all-label input {
                width: 20px;
                height: 20px;
                flex-shrink: 0;
                accent-color: var(--accent-color, #33b5e5);
            }
            
            .code-dump__field input:disabled {
                opacity: 0.45;
            }
            #file-preview {
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                overflow: auto;
                max-height: 320px;
                padding: 12px;
                border-radius: 8px;
                background: #10141d;
                color: #d7e1ee;
                font-size: 12px;
                user-select: text;
            }
        `;

        this.page.body.replaceChildren(this.style, content);

        content
            .querySelector("#select-folder")
            .addEventListener("click", () => {
                this.selectFolder();
            });

        content.querySelector("#scan-folder").addEventListener("click", () => {
            this.scanFolder();
        });

        const allExtensions = content.querySelector("#all-extensions");

        const extensionsInput = content.querySelector("#file-extensions");

        allExtensions.addEventListener("change", () => {
            extensionsInput.disabled = allExtensions.checked;
        });

        extensionsInput.disabled = allExtensions.checked;

        this.updateFolderUI();
    }

    updateFolderUI() {
        const nameOutput = this.page?.body.querySelector("#selected-folder");

        const pathOutput = this.page?.body.querySelector(
            "#selected-folder-path"
        );

        const scanButton = this.page?.body.querySelector("#scan-folder");

        if (!nameOutput || !pathOutput || !scanButton) return;

        if (this.selectedFolder) {
            nameOutput.textContent = this.selectedFolder.name;
            pathOutput.textContent = this.selectedFolder.url;
            scanButton.disabled = false;
        } else {
            nameOutput.textContent = "No folder selected";
            pathOutput.textContent = "Select a project folder to begin.";
            scanButton.disabled = true;
        }
    }

    registerLauncher() {
        if (typeof this.sidebarApps?.add !== "function") {
            throw new Error("Acode's sidebarApps API is unavailable.");
        }

        this.launcherInstalled = true;
        this.addLauncher();
    }

    addLauncher() {
        this.launcherReady = false;
        this.selectedDuringInstall = false;

        this.sidebarApps.add(
            "code",
            plugin.id,
            "Code Dump",
            () => {},
            false,
            () => {
                if (!this.launcherReady) {
                    this.selectedDuringInstall = true;
                    return;
                }

                this.launcherSelected = true;
                this.showPage();
            }
        );

        queueMicrotask(() => {
            if (!this.launcherInstalled) return;

            this.launcherReady = true;

            if (this.selectedDuringInstall) {
                this.resetLauncher();
            }
        });
    }

    resetLauncher() {
        if (!this.launcherInstalled) return;

        this.launcherSelected = false;
        this.sidebarApps.remove(plugin.id);

        if (this.launcherInstalled) {
            this.addLauncher();
        }
    }

    registerCommand() {
        this.commands.addCommand({
            name: "code-dump-open",
            description: "Open the Code Dump screen",
            exec: () => this.showPage()
        });
    }

    showPage() {
        if (!this.page) return;

        if (!this.page.isConnected) {
            this.page.show();
        }
    }

    async selectFolder() {
        try {
            const folder = await this.fileBrowser(
                "folder",
                "Select the project folder",
                true
            );

            if (!folder) return;

            if (folder.type !== "folder" || !folder.url) {
                throw new Error("A valid folder URL was not returned.");
            }

            this.selectedFolder = {
                name: folder.name || "Selected folder",
                url: folder.url
            };

            this.updateFolderUI();

            const status = this.page.body.querySelector("#scan-status");

            const results = this.page.body.querySelector("#scan-results");

            if (status) {
                status.textContent = "Folder selected. Ready to scan.";
            }

            if (results) {
                results.textContent = "No scan results yet.";
            }

            console.log("[Code Dump] Selected folder:", this.selectedFolder);
        } catch (error) {
            // Acode's file picker rejects when selection is
            // cancelled or access is denied. Keep the previous
            // selection instead of clearing it.
            console.error("[Code Dump] Folder selection failed:", error);
        }
    }

    async scanFolder() {
        const body = this.page?.body;
        const status = body?.querySelector("#scan-status");
        const results = body?.querySelector("#scan-results");
        const preview = body?.querySelector("#file-preview");
        const scanButton = body?.querySelector("#scan-folder");

        if (!status || !results || !scanButton) return;

        if (!this.selectedFolder) {
            status.textContent = "Select a folder first.";
            return;
        }

        const readList = selector =>
            (body.querySelector(selector)?.value || "")
                .split(",")
                .map(item => item.trim())
                .filter(Boolean);

        const includeAllExtensions =
            body.querySelector("#all-extensions")?.checked ?? false;

        const extensions = readList("#file-extensions").map(extension => {
            const normalized = extension.toLowerCase();
            return normalized.startsWith(".") ? normalized : `.${normalized}`;
        });

        const matchesExtension = name =>
            extensions.length === 0 ||
            extensions.some(extension =>
                name.toLowerCase().endsWith(extension)
            );

        const excludedFolders = new Set(
            readList("#excluded-folders").map(name => name.toLowerCase())
        );

        const excludedFiles = new Set(
            readList("#excluded-files").map(name => name.toLowerCase())
        );

        const files = [];
        const binaryFiles = [];
        const skippedFiles = [];
        const errors = [];
        const visited = new Set();

        let foldersScanned = 0;
        let filesDiscovered = 0;

        // Safety limits for the initial integration.
        const MAX_DETECT_BYTES = 10 * 1024 * 1024;
        const MAX_PREVIEW_BYTES = 1024 * 1024;
        const MAX_PREVIEW_CHARS = 50000;

        scanButton.disabled = true;
        status.textContent = "Scanning and detecting file types...";
        results.textContent = "";
        if (preview) preview.textContent = "Checking the first text file...";

        this.scannedFiles = [];
        this.binaryFiles = [];
        this.firstFileContent = null;

        const getName = entry => {
            if (entry.name) return entry.name;

            const url = entry.url || "";
            return decodeURIComponent(
                url.split("/").filter(Boolean).pop() || url
            );
        };

        const scanDirectory = async (directoryUrl, relativePath = "") => {
            if (visited.has(directoryUrl)) return;
            visited.add(directoryUrl);
            foldersScanned++;

            let entries;

            try {
                const directory = await this.fs(directoryUrl);
                entries = await directory.lsDir();
            } catch (error) {
                errors.push(
                    `${relativePath || "."}: ${error?.message || error}`
                );
                return;
            }

            if (!Array.isArray(entries)) {
                errors.push(
                    `${relativePath || "."}: Invalid directory listing`
                );
                return;
            }

            for (const entry of entries) {
                if (!entry?.url) {
                    errors.push(`${relativePath || "."}: Entry has no URL`);
                    continue;
                }

                const name = getName(entry);
                const itemPath = relativePath
                    ? `${relativePath}/${name}`
                    : name;

                if (entry.isDirectory) {
                    if (excludedFolders.has(name.toLowerCase())) continue;

                    await scanDirectory(entry.url, itemPath);
                    continue;
                }

                if (!entry.isFile) continue;

                filesDiscovered++;

                if (excludedFiles.has(name.toLowerCase())) {
                    skippedFiles.push({
                        name,
                        path: itemPath,
                        reason: "excluded"
                    });
                    continue;
                }

                try {
                    // Avoid reading exceptionally large files when their size
                    // is provided by Acode's directory listing.
                    if (
                        Number.isFinite(entry.size) &&
                        entry.size > MAX_DETECT_BYTES
                    ) {
                        skippedFiles.push({
                            name,
                            path: itemPath,
                            reason: "too large to inspect"
                        });
                        continue;
                    }

                    const file = await this.fs(entry.url);
                    const buffer = await file.readFile();

                    if (!(buffer instanceof ArrayBuffer)) {
                        errors.push(
                            `${itemPath}: File did not return an ArrayBuffer`
                        );
                        continue;
                    }

                    if (buffer.byteLength > MAX_DETECT_BYTES) {
                        skippedFiles.push({
                            name,
                            path: itemPath,
                            reason: "too large to inspect"
                        });
                        continue;
                    }

                    const bytes = new Uint8Array(buffer);
                    const textFile = isText(name, bytes);

                    const record = {
                        name,
                        path: itemPath,
                        url: entry.url,
                        size: bytes.byteLength
                    };

                    if (!textFile) {
                        binaryFiles.push(record);
                    } else if (
                        includeAllExtensions ||
                        matchesExtension(name)
                    ) {
                        files.push(record);
                    }
                } catch (error) {
                    errors.push(`${itemPath}: ${error?.message || error}`);
                }
            }
        };

        try {
            await scanDirectory(this.selectedFolder.url);

            files.sort((a, b) => a.path.localeCompare(b.path));
            binaryFiles.sort((a, b) => a.path.localeCompare(b.path));
            skippedFiles.sort((a, b) => a.path.localeCompare(b.path));

            // Keep text and binary files separate, while displaying both.
            const lines = [
                ...files.map(file => `[text] ${file.path}`),
                ...binaryFiles.map(file => `[binary] ${file.path}`),
                ...skippedFiles.map(
                    file => `[skipped: ${file.reason}] ${file.path}`
                )
            ];

            if (errors.length) {
                lines.push(
                    "",
                    `--- ${errors.length} error(s) ---`,
                    ...errors.map(error => `[error] ${error}`)
                );
            }

            results.textContent = lines.length
                ? lines.join("\n")
                : "No files found.";

            this.scannedFiles = files;
            this.binaryFiles = binaryFiles;

            // Reset selection for each fresh scan.
            this.selectedPaths.clear();

            this.renderFileTree();
            this.updateSelectionDebug();

            // TEST: read only the first detected text file.
            // The full contents are retained for further integration testing.
            const firstFile = this.scannedFiles[0];

            if (firstFile) {
                try {
                    if (firstFile.size > MAX_PREVIEW_BYTES) {
                        if (preview) {
                            preview.textContent =
                                `Preview skipped: ${firstFile.path} is ` +
                                `${firstFile.size} bytes. ` +
                                "The preview limit is 1 MiB.";
                        }
                    } else {
                        const file = await this.fs(firstFile.url);
                        const content = await file.readFile("utf-8");

                        if (typeof content !== "string") {
                            throw new Error("UTF-8 read did not return text");
                        }

                        this.firstFileContent = content;

                        if (preview) {
                            preview.textContent =
                                content.length > MAX_PREVIEW_CHARS
                                    ? content.slice(0, MAX_PREVIEW_CHARS) +
                                      "\n\n--- Preview truncated ---"
                                    : content;
                        }

                        console.log(
                            "[Code Dump] First text file content loaded",
                            {
                                path: firstFile.path,
                                size: firstFile.size,
                                characters: content.length
                            }
                        );
                    }
                } catch (error) {
                    const message = error?.message || String(error);

                    if (preview) {
                        preview.textContent = `Could not preview ${firstFile.path}:\n${message}`;
                    }
                }
            } else if (preview) {
                preview.textContent = "No text files available to preview.";
            }

            status.textContent =
                `Scanned ${foldersScanned} folder(s); ` +
                `discovered ${filesDiscovered} file(s); ` +
                `${files.length} text file(s); ` +
                `${binaryFiles.length} binary file(s); ` +
                `${skippedFiles.length} skipped; ` +
                `${errors.length} error(s).`;

            console.log("[Code Dump] Recursive scan complete", {
                root: this.selectedFolder.url,
                foldersScanned,
                filesDiscovered,
                textFiles: files.length,
                binaryFiles: binaryFiles.length,
                skippedFiles,
                errors
            });
        } catch (error) {
            status.textContent = `Scan failed: ${error?.message || error}`;

            console.error("[Code Dump] Scan failed:", error);
        } finally {
            scanButton.disabled = !this.selectedFolder;
        }
    }

    destroy() {
        if (this.page) {
            this.page.off("hide", this.handlePageHide);

            if (this.page.isConnected) {
                this.page.hide();
            }

            this.page.body?.replaceChildren();
            this.page.classList.remove("code-dump-page");
        }

        this.launcherInstalled = false;
        this.launcherReady = false;
        this.launcherSelected = false;

        this.sidebarApps?.remove(plugin.id);
        this.commands?.removeCommand?.("code-dump-open");

        this.style?.remove();

        this.page = null;
        this.sidebarApps = null;
        this.fileBrowser = null;
        this.commands = null;
        this.fs = null;
        this.style = null;
    }

    renderFileTree() {
        const body = this.page?.body;
        const results = body?.querySelector("#scan-results");

        if (!results) return;

        results.replaceChildren();

        const root = {
            name: this.selectedFolder?.name || "Project",
            path: "",
            folders: new Map(),
            files: []
        };

        // Build a hierarchy from relative paths.
        for (const file of this.scannedFiles) {
            const parts = file.path.split("/");
            const fileName = parts.pop();
            let folder = root;
            let currentPath = "";

            for (const part of parts) {
                currentPath = currentPath ? `${currentPath}/${part}` : part;

                if (!folder.folders.has(part)) {
                    folder.folders.set(part, {
                        name: part,
                        path: currentPath,
                        folders: new Map(),
                        files: []
                    });
                }

                folder = folder.folders.get(part);
            }

            folder.files.push({
                ...file,
                name: fileName
            });
        }

        // Include binary files in the tree for visibility, but don't
        // make them selectable in this first version.
        for (const file of this.binaryFiles) {
            const parts = file.path.split("/");
            const fileName = parts.pop();
            let folder = root;
            let currentPath = "";

            for (const part of parts) {
                currentPath = currentPath ? `${currentPath}/${part}` : part;

                if (!folder.folders.has(part)) {
                    folder.folders.set(part, {
                        name: part,
                        path: currentPath,
                        folders: new Map(),
                        files: []
                    });
                }

                folder = folder.folders.get(part);
            }

            folder.files.push({
                ...file,
                name: fileName,
                binary: true
            });
        }

        const createCheckbox = (label, checked, onChange, disabled = false) => {
            const wrapper = document.createElement("label");
            wrapper.style.display = "flex";
            wrapper.style.alignItems = "center";
            wrapper.style.gap = "8px";
            wrapper.style.padding = "5px 0";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = checked;
            checkbox.disabled = disabled;
            checkbox.addEventListener("change", () =>
                onChange(checkbox.checked)
            );

            const text = document.createElement("span");
            text.textContent = label;

            wrapper.append(checkbox, text);

            return { wrapper, checkbox };
        };

        const allPaths = this.scannedFiles.map(file => file.path);

        const selectAll = createCheckbox(
            "SELECT ALL",
            allPaths.length > 0 &&
                allPaths.every(path => this.selectedPaths.has(path)),
            checked => {
                this.selectedPaths = new Set(checked ? allPaths : []);

                this.renderFileTree();
                this.updateSelectionDebug();
            }
        );

        results.append(selectAll.wrapper);

        const treeContainer = document.createElement("div");
        treeContainer.style.paddingLeft = "8px";
        results.append(treeContainer);

        const renderFolder = (folder, container, isRoot = false) => {
            const folderFiles = [];

            const collectFiles = node => {
                folderFiles.push(
                    ...node.files
                        .filter(file => !file.binary)
                        .map(file => file.path)
                );

                for (const child of node.folders.values()) {
                    collectFiles(child);
                }
            };

            collectFiles(folder);

            const folderRow = document.createElement("div");
            folderRow.style.display = "flex";
            folderRow.style.alignItems = "center";
            folderRow.style.gap = "6px";
            folderRow.style.paddingTop = "8px";

            const folderCheckbox = document.createElement("input");
            folderCheckbox.type = "checkbox";
            folderCheckbox.checked =
                folderFiles.length > 0 &&
                folderFiles.every(path => this.selectedPaths.has(path));

            folderCheckbox.indeterminate =
                folderFiles.some(path => this.selectedPaths.has(path)) &&
                !folderCheckbox.checked;

            folderCheckbox.disabled = folderFiles.length === 0;

            folderCheckbox.addEventListener("change", () => {
                for (const path of folderFiles) {
                    if (folderCheckbox.checked) {
                        this.selectedPaths.add(path);
                    } else {
                        this.selectedPaths.delete(path);
                    }
                }

                this.renderFileTree();
                this.updateSelectionDebug();
            });

            const folderLabel = document.createElement("strong");
            folderLabel.textContent = isRoot
                ? `📁 ${folder.name} (root)`
                : `📁 ${folder.name}/`;

            folderRow.append(folderCheckbox, folderLabel);
            container.append(folderRow);

            const contents = document.createElement("div");
            contents.style.paddingLeft = "22px";
            container.append(contents);

            // Show files before subfolders.
            for (const file of folder.files) {
                const isBinary = Boolean(file.binary);

                const fileLabel = isBinary
                    ? `[binary] ${file.name}`
                    : file.name;

                const item = createCheckbox(
                    fileLabel,
                    !isBinary && this.selectedPaths.has(file.path),
                    checked => {
                        if (checked) {
                            this.selectedPaths.add(file.path);
                        } else {
                            this.selectedPaths.delete(file.path);
                        }

                        this.renderFileTree();
                        this.updateSelectionDebug();
                    },
                    isBinary
                );

                item.wrapper.style.paddingLeft = "4px";
                contents.append(item.wrapper);
            }

            for (const child of folder.folders.values()) {
                renderFolder(child, contents);
            }
        };

        renderFolder(root, treeContainer, true);
    }

    updateSelectionDebug() {
        const output = this.page?.body?.querySelector("#selection-debug");

        if (!output) return;

        const selected = this.scannedFiles
            .filter(file => this.selectedPaths.has(file.path))
            .map(file => file.path);

        output.textContent = selected.length
            ? selected.join("\n")
            : "No files selected.";

        console.log("[Code Dump] Selected files:", selected);
    }
}

if (window.acode) {
    const acodePlugin = new AcodePlugin();

    acode.setPluginInit(plugin.id, async (baseUrl, page) => {
        await acodePlugin.init(baseUrl, page);
    });

    acode.setPluginUnmount(plugin.id, () => {
        acodePlugin.destroy();
    });
}
