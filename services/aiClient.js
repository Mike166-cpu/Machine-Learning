// backend/utils/aiClient.js

const ModelClient = require("@azure-rest/ai-inference").default;
const { isUnexpected } = require("@azure-rest/ai-inference");
const { AzureKeyCredential } = require("@azure/core-auth");

const token = process.env.GITHUB_TOKEN; // Ensure this is set in your environment variables
const endpoint = "https://models.github.ai/inference";
const model = "meta/Llama-4-Maverick-17B-128E-Instruct-FP8";

const askAI = async (userPrompt) => {
  const client = ModelClient(endpoint, new AzureKeyCredential(token));

  const response = await client.path("/chat/completions").post({
    body: {
      messages: [
        { role: "system", content: "You are an AI assistant for HR shift suggestions." },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.8,
      top_p: 1.0,
      model: model
    }
  });

  if (isUnexpected(response)) {
    throw new Error(response.body.error.message || "Unexpected error");
  }

  return response.body.choices[0].message.content;
};

module.exports = { askAI };