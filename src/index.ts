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
          try {
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
          } catch (error) {
            handleError(error);
          }
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
          try {
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
          } catch (error) {
            handleError(error);
          }
        },
      },
      getPageSearchResults: {
        description: "Searches for pages matching a query",
        inputSchema: z.object({
          query: z.string(),
          limit: z.number().optional(),
        }),
        outputSchema: z.object({
          results: z.array(z.string()),
        }),
        handler: async ({ input }) => {
          const { query, limit = 10 } = input;

          const url = `${mediaWikiAPIBase}?action=query&list=search&format=json&srsearch=${encodeURIComponent(query)}&srlimit=${limit}`;

          const response = await authenticatedFetch(url, {
            headers: {
              "User-Agent": USER_AGENT,
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to search pages: ${response.statusText}`);
          }

          const data = await response.json();
          const results = data.query?.search?.map((item: any) => item.title) || [];

          return { results };
        },
      },
      getPageMetadata: {
        description: "Fetches metadata for a MediaWiki page",
        inputSchema: z.object({
          title: z.string(),
        }),
        outputSchema: z.object({
          pageId: z.number(),
          lastEdited: z.string(),
          contributors: z.array(z.string()),
        }),
        handler: async ({ input }) => {
          const { title } = input;

          const url = `${mediaWikiAPIBase}?action=query&format=json&prop=info|contributors&titles=${encodeURIComponent(title)}`;

          const response = await authenticatedFetch(url, {
            headers: {
              "User-Agent": USER_AGENT,
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch page metadata: ${response.statusText}`);
          }

          const data = await response.json();
          const pages = data.query?.pages;
          const page = pages ? Object.values(pages)[0] : null;

          if (!page) {
            throw new Error(`Page "${title}" not found.`);
          }

          return {
            pageId: page.pageid,
            lastEdited: page.touched,
            contributors: page.contributors?.map((c: any) => c.name) || [],
          };
        },
      },
      createPage: {
        description: "Creates a new MediaWiki page",
        inputSchema: z.object({
          title: z.string(),
          content: z.string(),
          summary: z.string().optional(),
        }),
        outputSchema: z.object({
          success: z.boolean(),
        }),
        handler: async ({ input }) => {
          const { title, content, summary } = input;

          const url = `${mediaWikiAPIBase}?action=edit&format=json`;

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
            throw new Error(`Failed to create page: ${editResponse.statusText}`);
          }

          const editResult = await editResponse.json();

          return { success: editResult.edit?.result === "Success" };
        },
      },
      deletePage: {
        description: "Deletes a MediaWiki page",
        inputSchema: z.object({
          title: z.string(),
          reason: z.string().optional(),
        }),
        outputSchema: z.object({
          success: z.boolean(),
        }),
        handler: async ({ input }) => {
          const { title, reason } = input;

          const url = `${mediaWikiAPIBase}?action=delete&format=json`;

          const tokenResponse = await authenticatedFetch(
            `${mediaWikiAPIBase}?action=query&meta=tokens&format=json`,
            {
              headers: {
                "User-Agent": USER_AGENT,
              },
            }
          );

          if (!tokenResponse.ok) {
            throw new Error(`Failed to fetch delete token: ${tokenResponse.statusText}`);
          }

          const tokenData = await tokenResponse.json();
          const deleteToken = tokenData.query?.tokens?.csrftoken;

          if (!deleteToken) {
            throw new Error("Failed to retrieve delete token.");
          }

          const deleteResponse = await authenticatedFetch(url, {
            method: "POST",
            headers: {
              "User-Agent": USER_AGENT,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              title,
              reason: reason || "",
              token: deleteToken,
            }),
          });

          if (!deleteResponse.ok) {
            throw new Error(`Failed to delete page: ${deleteResponse.statusText}`);
          }

          const deleteResult = await deleteResponse.json();

          return { success: deleteResult.delete?.result === "Success" };
        },
      },
      getEntityData: {
        description: "Fetches data for a Wikibase entity",
        inputSchema: z.object({
          id: z.string(), // The ID of the entity (e.g., Q42)
        }),
        outputSchema: z.object({
          entity: z.any(), // The full JSON representation of the entity
        }),
        handler: async ({ input }) => {
          const { id } = input;

          const url = `${wikiBaseAPIBase}?action=wbgetentities&format=json&ids=${encodeURIComponent(id)}`;

          const response = await authenticatedFetch(url, {
            headers: {
              "User-Agent": USER_AGENT,
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch entity data: ${response.statusText}`);
          }

          const data = await response.json();
          const entity = data.entities?.[id];

          if (!entity) {
            throw new Error(`Entity "${id}" not found.`);
          }

          return { entity };
        },
      },
      searchEntities: {
        description: "Searches for Wikibase entities by label or description",
        inputSchema: z.object({
          search: z.string(), // The search term
          type: z.enum(["item", "property"]), // The type of entity to search for
          limit: z.number().optional(), // Maximum number of results
        }),
        outputSchema: z.object({
          results: z.array(
            z.object({
              id: z.string(), // Entity ID
              label: z.string(), // Entity label
            })
          ),
        }),
        handler: async ({ input }) => {
          const { search, type, limit = 10 } = input;

          const url = `${wikiBaseAPIBase}?action=wbsearchentities&format=json&search=${encodeURIComponent(
            search
          )}&type=${type}&limit=${limit}`;

          const response = await authenticatedFetch(url, {
            headers: {
              "User-Agent": USER_AGENT,
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to search entities: ${response.statusText}`);
          }

          const data = await response.json();
          const results = data.search?.map((item: any) => ({
            id: item.id,
            label: item.label,
          })) || [];

          return { results };
        },
      },
      editEntity: {
        description: "Creates or edits a Wikibase entity",
        inputSchema: z.object({
          id: z.string().optional(), // The ID of the entity to edit (optional for creation)
          data: z.any(), // The JSON representation of the entity data
          summary: z.string().optional(), // Edit summary
        }),
        outputSchema: z.object({
          success: z.boolean(), // Whether the operation was successful
          id: z.string(), // The ID of the created or edited entity
        }),
        handler: async ({ input }) => {
          const { id, data, summary } = input;

          const url = `${wikiBaseAPIBase}?action=wbeditentity&format=json`;

          const tokenResponse = await authenticatedFetch(
            `${wikiBaseAPIBase}?action=query&meta=tokens&format=json&type=csrf`,
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

          const editResponse = await authenticatedFetch(url, {
            method: "POST",
            headers: {
              "User-Agent": USER_AGENT,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              id: id || "", // Empty for creating a new entity
              data: JSON.stringify(data),
              summary: summary || "",
              token: editToken,
            }),
          });

          if (!editResponse.ok) {
            throw new Error(`Failed to edit entity: ${editResponse.statusText}`);
          }

          const editResult = await editResponse.json();

          return {
            success: editResult.success === 1,
            id: editResult.entity?.id,
          };
        },
      },
      addStatement: {
        description: "Adds a statement to a Wikibase entity",
        inputSchema: z.object({
          id: z.string(), // The ID of the entity
          property: z.string(), // The property ID
          value: z.any(), // The value of the statement
        }),
        outputSchema: z.object({
          success: z.boolean(), // Whether the statement was successfully added
        }),
        handler: async ({ input }) => {
          const { id, property, value } = input;

          const url = `${wikiBaseAPIBase}?action=wbcreateclaim&format=json`;

          const tokenResponse = await authenticatedFetch(
            `${wikiBaseAPIBase}?action=query&meta=tokens&format=json&type=csrf`,
            {
              headers: {
                "User-Agent": USER_AGENT,
              },
            }
          );

          if (!tokenResponse.ok) {
            throw new Error(`Failed to fetch claim token: ${tokenResponse.statusText}`);
          }

          const tokenData = await tokenResponse.json();
          const claimToken = tokenData.query?.tokens?.csrftoken;

          if (!claimToken) {
            throw new Error("Failed to retrieve claim token.");
          }

          const claimResponse = await authenticatedFetch(url, {
            method: "POST",
            headers: {
              "User-Agent": USER_AGENT,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              entity: id,
              property,
              snaktype: "value",
              value: JSON.stringify(value),
              token: claimToken,
            }),
          });

          if (!claimResponse.ok) {
            throw new Error(`Failed to add statement: ${claimResponse.statusText}`);
          }

          const claimResult = await claimResponse.json();

          return { success: claimResult.success === 1 };
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
  try {
    const headers = options.headers || {};
    if (sessionCookie) {
      headers["Cookie"] = sessionCookie;
    }
    const response = await fetch(url, { ...options, headers });
    return response;
  } catch (error) {
    handleError(error);
  }
}

function handleError(error: unknown): never {
  if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
    throw new Error(error.message);
  } else {
    console.error(`Unknown error: ${JSON.stringify(error)}`);
    throw new Error("An unknown error occurred.");
  }
}