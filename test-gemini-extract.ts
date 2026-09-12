import dotenv from 'dotenv';
dotenv.config();

async function test() {
  const key = process.env.GEMINI_API_KEY;
  const prompt = `You are a recruitment extraction expert. A scraped notification is given.
We need the official website of the organization (e.g. https://www.uppsc.up.nic.in) and the exact PDF link for this notification if we can infer it or if it's in the text.
Text: Current Events - Join Indian Navy | Government of India ...
Extract as JSON:
{ 
  "organizationName": "",
  "officialWebsite": "", 
  "pdfUrl": ""
}`;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    })
  });
  console.log(await res.text());
}
test().catch(console.error);
