import { PrismaClient } from '@prisma/client';

// Simple dictionary approach for common recruitment terms
const dict = {
  "Recruitment by": "द्वारा भर्ती:",
  "Staff Selection Commission (SSC)": "कर्मचारी चयन आयोग (SSC)",
  "Union Public Service Commission (UPSC)": "संघ लोक सेवा आयोग (UPSC)",
  "Railway Recruitment Boards (RRBs)": "रेलवे भर्ती बोर्ड (RRB)",
  "Indian Space Research Organisation (ISRO)": "भारतीय अंतरिक्ष अनुसंधान संगठन (ISRO)",
  "State Bank of India": "भारतीय स्टेट बैंक (SBI)",
  "Bank of India": "बैंक ऑफ इंडिया",
  
  "Sub-Inspector": "उप-निरीक्षक (Sub-Inspector)",
  "Constable": "सिपाही (Constable)",
  "Junior Engineer": "कनिष्ठ अभियंता (Junior Engineer)",
  "Specialist Officers": "विशेषज्ञ अधिकारी (Specialist Officers)",
  "Apprentices": "प्रशिक्षु (Apprentices)",
  "Management Trainee": "प्रबंधन प्रशिक्षु (Management Trainee)",
  "Assistant Manager": "सहायक प्रबंधक (Assistant Manager)",
  "Assistant": "सहायक",
  "Officer": "अधिकारी",
  "Clerk": "लिपिक",
  
  // Qualification
  "Bachelor's Degree": "स्नातक की उपाधि (Bachelor's Degree)",
  "Master's Degree": "स्नातकोत्तर उपाधि (Master's Degree)",
  "diploma": "डिप्लोमा",
  "engineering": "इंजीनियरिंग",
  
  "any stream": "किसी भी स्ट्रीम में",
  "recognized university": "मान्यता प्राप्त विश्वविद्यालय",
  "recognized Board": "मान्यता प्राप्त बोर्ड",
  "years": "वर्ष",
  "Maximum": "अधिकतम"
};

function translate(text: string | null) {
  if (!text) return null;
  let res = text;
  for (const [en, hi] of Object.entries(dict)) {
     // use regex for case insensitive replace
     const re = new RegExp(en, 'gi');
     res = res.replace(re, hi);
  }
  return res;
}

const prisma = new PrismaClient();

async function main() {
   const items = await prisma.notification.findMany({
       where: { origin: 'pdf_verified' }
   });
   
   for (const item of items) {
       await prisma.notification.update({
           where: { id: item.id },
           data: {
               titleHi: translate(item.title) || '',
               summaryHi: translate(item.summary) || '',
               // For qualification details, we just store it in string format
           }
       });
   }
   console.log("Translations applied!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
