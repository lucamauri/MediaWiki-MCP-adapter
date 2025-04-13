# MediaWikiAdapter

![smithery badge](https://smithery.ai/badge/@lucamauri/mediawiki-mcp-adapter)

A custom **Model Context Protocol (MCP)** adapter for interacting with MediaWiki and WikiBase APIs. This adapter allows you to fetch and edit MediaWiki pages programmatically using the MCP framework.

## Features

- Fetch the content of a MediaWiki page.
- Edit a MediaWiki page with new content and an optional summary.
- Configurable API base URLs for different MediaWiki and WikiBase instances.

## Requirements

- Node.js (v16 or later)
- TypeScript (for development)
- MediaWiki instance with API access enabled

## Installation

1. Clone the repository:
```bash
   git clone https://github.com/yourusername/mediawikiadapter.git
   cd mediawikiadapter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Usage

### Configure the Adapter

You can configure the adapter to use custom MediaWiki and WikiBase API endpoints:

```javascript
server.configure({
  mediaWikiAPIBase: "https://my.mediawiki.instance/api.php",
  wikiBaseAPIBase: "https://my.wikibase.instance/api.php",
});
```

### Start the MCP Server

Run the MCP server using the following command:
```bash
node build/index.js
```

### Resources

#### getPageContent

Fetches the content of a MediaWiki page.

- **Input Schema**:
```json
  {
    "title": "string"
  }
```
- **Output Schema**:
  ```json
  {
    "content": "string"
  }
  ```

#### Example Usage:
```javascript
const response = await server.callResource("getPageContent", {
  title: "Main Page",
});
console.log(response.content);
```
---

### Tools

#### editPage

Edits a MediaWiki page with new content.

- **Input Schema**:
```json
  {
    "title": "string",
    "content": "string",
    "summary": "string (optional)"
  }
```
- **Output Schema**:
```json
  {
    "success": "boolean"
  }
```

#### Example Usage:
```javascript
const response = await server.callTool("editPage", {
  title: "Main Page",
  content: "Updated content for the page.",
  summary: "Updated via MediaWikiAdapter",
});
console.log(response.success ? "Edit successful" : "Edit failed");
```

---

## Development

### Run in Development Mode

To run the project in development mode with TypeScript:
```bash
npm run dev
```

### Linting

Run the linter to check for code quality:
```bash
npm run lint
```

### Testing

Currently, no tests are implemented. You can add tests to the `test` directory and run them using:
```bash
npm test
```

---

## Configuration

The adapter uses the following default API base URLs:

- **MediaWiki API Base**: https://en.wikipedia.org/w/api.php
- **WikiBase API Base**: https://www.wikidata.org/w/api.php

You can override these defaults using the `server.configure()` method.

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Submit a pull request with a detailed description of your changes.

---

## License

This project is licensed under the **LGPL-3.0-or-later** license. See the [LICENSE](LICENSE) file for details.

---

## Author

Created by **Luca Mauri**.
