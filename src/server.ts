import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "node:fs/promises";
import { CreateMessageResultSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new McpServer({
  name: "test",
  version: "1.0.0",
  capabilities: {
    resource: {},
    tools: {},
    prompts: {},
  },
});

server.resource("users", "users://all", {
  "title": "Users",
  "description": "A list of all users in the database",
  "mimeType": "application/json",
}, async (uri) => {
  const users = await import("./data/users.json", {
    with: { type: "json" },
  }).then((m) => m.default);

  return {
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify(users),
        mimeType: "application/json",
      }
    ]
  }
});

server.resource("user-details", new ResourceTemplate("users://{userId}/profile", { list: undefined }), {
  "title": "User Profile",
  "description": "Detailed profile information for a specific user",
  "mimeType": "application/json",
}, async (uri, { userId }) => {
  const users = await import("./data/users.json", {
    with: { type: "json" },
  }).then((m) => m.default);
  const user = users.find(u => u.id === parseInt(userId as string));

  if(!user) {
    return {
      contents: [
        {
          uri: uri.href,
          text: JSON.stringify({ error: "User not found" }),
          mimeType: "application/json",
        }
      ]
    }
  }

  return {
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify(user),
        mimeType: "application/json",
      }
    ]
  }
});

const createUserSchema = {
  name: z.string(),
  email: z.string(),
  address: z.string(),
  phone: z.string(),
};

server.tool(
  "create-user",
  "Create a new user in the database",
  createUserSchema,
  {
    title: "Create a new user",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async (params) => {
    try {
      const id = await createUser(params);

      return {
        content: [{ type: "text", text: `User ${id} created successfully` }],
      };
    } catch {
      return {
        content: [{ type: "text", text: "Failed to create user" }],
      };
    }
  }
);

server.tool(
  "create-random-user",
  "Create a random user with fake data",
  {
    title: "Create Random User",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async () => {
    const res = await server.server.request(
      {
        method: "sampling/createMessage",
        params: {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "Generate fake user data. The user should have a realistic name, email, address, and phone number. Return this data as a JSON object with no other text or formatter so it can be used with JSON.parse.",
              },
            },
          ],
          maxTokens: 1024,
        },
      },
      CreateMessageResultSchema
    )

    if (res.content.type !== "text") {
      return {
        content: [{ type: "text", text: "Failed to generate user data" }],
      }
    }

    try {
      const fakeUser = JSON.parse(
        res.content.text
          .trim()
          .replace(/^```json/, "")
          .replace(/```$/, "")
          .trim()
      )

      const id = await createUser(fakeUser)
      return {
        content: [{ type: "text", text: `User ${id} created successfully` }],
      }
    } catch {
      return {
        content: [{ type: "text", text: "Failed to generate user data" }],
      }
    }
  }
)

server.prompt("generate-fake-user", "Generate a fake user profile", {
  name: z.string(),
}, 
  ({ name }) => {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:  `Generate a fake user profile for a person named ${name}. Include name, email, address, and phone number in JSON format.`,
            },
        }
      ]
    }
  }
)

async function createUser(user: {
  name: string;
  email: string;
  address: string;
  phone: string;
}) {
  const users = await import("./data/users.json", {
    with: { type: "json" },
  }).then((m) => m.default);

  const id = users.length + 1;

  users.push({
    id,
    ...user,
  });

  await fs.writeFile("./src/data/users.json", JSON.stringify(users, null, 2));

  return id;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main();
