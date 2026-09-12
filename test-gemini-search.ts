import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const key = process.env.GEMINI_API_KEY;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "What is the official website of UPPSC?" }] }],
      tools: [{ googleSearch: {} }]
    })
  });
  console.log(res.status, await res.text());
}
test().catch(console.error);
