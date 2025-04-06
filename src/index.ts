import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fetch from "node-fetch"; // Ensure you install node-fetch if not already installed

// Extend the schema for the config object using Zod
const ConfigSchema = z.object({
  mediaWikiAPIBase: z.string().url().optional(), // Optional URL string
  wikiBaseAPIBase: z.string().url().optional(), // Optional URL string
  botUsername: z.string().optional(), // Bot username
  botPassword: z.string().optional(), // Bot password
});

// Infer the TypeScript type from the schema
type Config = z.infer<typeof ConfigSchema>;

// Variable to store the session token
let sessionCookie: string | null = null;

// Function to log in as a bot
async function loginAsBot(username: string, password: string) {
  const loginUrl = `${mediaWikiAPIBase}?action=login&format=json`;

  // Step 1: Get login token
  const tokenResponse = await fetch(`${mediaWikiAPIBase}?action=query&meta=tokens&type=login&format=json`, {
    headers: {
      "User-Agent": USER_AGENT,
    },
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to fetch login token: ${tokenResponse.statusText}`);
  }

  const tokenData = await tokenResponse.json();
  const loginToken = tokenData.query?.tokens?.logintoken;

  if (!loginToken) {
    throw new Error("Failed to retrieve login token.");
  }

  // Step 2: Log in with the token
  const loginResponse = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      lgname: username,
      lgpassword: password,
      lgtoken: loginToken,
    }),
  });

  if (!loginResponse.ok) {
    throw new Error(`Failed to log in: ${loginResponse.statusText}`);
  }

  const loginResult = await loginResponse.json();

  if (loginResult.login?.result !== "Success") {
    throw new Error(`Login failed: ${loginResult.login?.reason || "Unknown reason"}`);
  }

  // Store the session cookie
  sessionCookie = loginResponse.headers.get("set-cookie");
  console.log("Bot logged in successfully.");
}

/*
Default API base URL
Can be overridden by the clien with a configuration like this:

server.configure({
  mediaWikiAPIBase: "https://my.mediawiki.instance/api.php",
  wikiBaseAPIBase: "https://my.wikibase.instance/api.php",
  botUsername: "MyBotUsername",
  botPassword: "MyBotPassword",
});
*/
let mediaWikiAPIBase = "https://en.wikipedia.org/w/api.php"; // Default to English wikipedia
let wikiBaseAPIBase = "https://www.wikidata.org/w/api.php"; // Default to Wikidata

const USER_AGENT = "mediawikiadapter-app/1.0";

// Create server instance
const server = new McpServer({
  name: "mediawikiadapter",
  version: "1.0.0",
  capabilities: {
    resources: {
      getPageContent: {
        description: "Fetches the content of a MediaWiki page",
        inputSchema: z.object({
          title: z.string(), // The title of the page to fetch
        }),
        outputSchema: z.object({
          content: z.string(), // The content of the page
        }),
        handler: async ({ input }) => {
          const { title } = input;

          // Construct the API URL
          const url = `${mediaWikiAPIBase}?action=query&format=json&prop=revisions&rvprop=content&titles=${encodeURIComponent(
            title
          )}`;

          // Fetch the page content
          const response = await authenticatedFetch(url, {
            headers: {
              "User-Agent": USER_AGENT,
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch page content: ${response.statusText}`);
          }

          const data = await response.json();

          // Extract the page content
          const pages = data.query?.pages;
          const page = pages ? Object.values(pages)[0] : null;
          const content = page?.revisions?.[0]?.["*"];

          if (!content) {
            throw new Error(`Page "${title}" not found or has no content.`);
          }

          return { content };
        },
      },
    },
    tools: {
      editPage: {
        description: "Edits a MediaWiki page",
        inputSchema: z.object({
          title: z.string(), // The title of the page to edit
          content: z.string(), // The new content for the page
          summary: z.string().optional(), // Edit summary
        }),
        outputSchema: z.object({
          success: z.boolean(), // Whether the edit was successful
        }),
        handler: async ({ input }) => {
          const { title, content, summary } = input;

          // Construct the API URL
          const url = `${mediaWikiAPIBase}?action=edit&format=json`;

          // Fetch an edit token (required for editing)
          const tokenResponse = await authenticatedFetch(
            `${mediaWikiAPIBase}?action=query&meta=tokens&format=json`,
            {
              headers: {
                "User-Agent": USER_AGENT,
              },
            }
          );

          if (!tokenResponse.ok) {
            throw new Error(`Failed to fetch edit token: ${tokenResponse.statusText}`);
          }

          const tokenData = await tokenResponse.json();
          const editToken = tokenData.query?.tokens?.csrftoken;

          if (!editToken) {
            throw new Error("Failed to retrieve edit token.");
          }

          // Perform the edit
          const editResponse = await authenticatedFetch(url, {
            method: "POST",
            headers: {
              "User-Agent": USER_AGENT,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              title,
              text: content,
              summary: summary || "",
              token: editToken,
            }),
          });

          if (!editResponse.ok) {
            throw new Error(`Failed to edit page: ${editResponse.statusText}`);
          }

          const editResult = await editResponse.json();

          return { success: editResult.edit?.result === "Success" };
        },
      },
    },
  },
  onConfigure: async (config: unknown) => {
    // Validate the config object using Zod
    const parsedConfig = ConfigSchema.parse(config);

    // Allow the client to set the API base URL
    if (parsedConfig.mediaWikiAPIBase) {
      mediaWikiAPIBase = parsedConfig.mediaWikiAPIBase;
    }
    if (parsedConfig.wikiBaseAPIBase) {
      wikiBaseAPIBase = parsedConfig.wikiBaseAPIBase;
    }

    // Log in as a bot if credentials are provided
    if (parsedConfig.botUsername && parsedConfig.botPassword) {
      await loginAsBot(parsedConfig.botUsername, parsedConfig.botPassword);
    }
  },
});

// Update fetch calls to include the session cookie if available
async function authenticatedFetch(url: string, options: RequestInit = {}) {
  const headers = options.headers || {};
  if (sessionCookie) {
    headers["Cookie"] = sessionCookie;
  }
  return fetch(url, { ...options, headers });
}