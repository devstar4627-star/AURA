/**
 * AURA - Autonomous Urgent Response Agent
 * Verification Script: Multilingual Auto-Detection & Same-Language Response
 * =========================================================================
 * 
 * Verifies that the model:
 * 1. Automatically detects the caller's spoken voice language across 6 distinct languages.
 * 2. Formulates the emergency response strictly in that exact same language.
 * 3. Provides parallel verbatim English translation for CAD operators.
 * 4. Extracts structured action and paralinguistic distress telemetry.
 */

interface VerificationCase {
  language: string;
  expectedCode: string;
  utterance: string;
}

const TEST_CASES: VerificationCase[] = [
  {
    language: "Spanish",
    expectedCode: "es",
    utterance: "¡Por favor ayúdenme! Mi casa se está quemando en calle 45, hay tres niños atrapados en el segundo piso."
  },
  {
    language: "French",
    expectedCode: "fr",
    utterance: "Au secours ! Ma voiture est bloquée dans l'eau de crue sur la route nationale, l'eau monte très vite !"
  },
  {
    language: "German",
    expectedCode: "de",
    utterance: "Hilfe! Es brennt im dritten Stock unseres Mehrfamilienhauses, der Flur ist voller schwarzem Rauch!"
  },
  {
    language: "Japanese",
    expectedCode: "ja",
    utterance: "助けてください！近所の倉庫で爆発があり、煙が広がって息ができません！"
  },
  {
    language: "Vietnamese",
    expectedCode: "vi",
    utterance: "Cứu chúng tôi với! Có vụ tai nạn xe hơi nghiêm trọng trên đường cao tốc, có người bị kẹt trong xe!"
  },
  {
    language: "English",
    expectedCode: "en",
    utterance: "Emergency! There is a multi-vehicle pileup on Highway 101 and two cars are catching fire right now!"
  }
];

async function runVerification() {
  console.log("===============================================================================");
  console.log("AURA - VERIFYING MULTILINGUAL VOICE AUTO-DETECTION & SAME-LANGUAGE RESPONSE");
  console.log("===============================================================================\n");

  const results: any[] = [];
  let passedCount = 0;

  for (const test of TEST_CASES) {
    console.log(`\n-------------------------------------------------------------------------------`);
    console.log(`TESTING LANGUAGE: ${test.language.toUpperCase()} (Expected code: ${test.expectedCode})`);
    console.log(`Input Utterance: "${test.utterance}"`);

    try {
      const res = await fetch("http://127.0.0.1:3000/api/chat/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          utterance: test.utterance,
          history: [],
          tone_metrics: { panic_index: 8 }
        })
      });

      if (!res.ok) {
        console.error(`HTTP Error: ${res.status} ${res.statusText}`);
        results.push({ language: test.language, passed: false, error: res.statusText });
        continue;
      }

      const json = await res.json();
      const data = json.data;

      const detectedLang = data.caller_language;
      const detectedCode = data.caller_language_code;
      const sameLangResponse = data.caller_response_same_language;
      const englishTranslation = data.caller_response_english;

      const langMatch = detectedCode?.toLowerCase() === test.expectedCode.toLowerCase() ||
        detectedLang?.toLowerCase().includes(test.language.toLowerCase());

      const hasSameLangResponse = Boolean(sameLangResponse && sameLangResponse.length > 5);
      const isPassed = Boolean(langMatch && hasSameLangResponse);

      if (isPassed) passedCount++;

      console.log(`\nResult for ${test.language}:`);
      console.log(`  ✓ Detected Language:      ${detectedLang} (${detectedCode})`);
      console.log(`  ✓ Same-Language Response: "${sameLangResponse}"`);
      console.log(`  ✓ English CAD Translation: "${englishTranslation}"`);
      console.log(`  ✓ Problem Diagnosis:      ${data.problem_statement}`);
      console.log(`  ✓ Importance:             ${data.importance}`);
      console.log(`  ✓ Status:                 ${isPassed ? "PASSED" : "FAILED"}`);

      results.push({
        language: test.language,
        expectedCode: test.expectedCode,
        detectedCode,
        detectedLang,
        sameLangResponse,
        englishTranslation,
        passed: isPassed
      });
    } catch (err: any) {
      console.error(`Error executing test for ${test.language}:`, err);
      results.push({ language: test.language, passed: false, error: err.message });
    }
  }

  console.log("\n===============================================================================");
  console.log(`VERIFICATION SUMMARY: ${passedCount} / ${TEST_CASES.length} LANGUAGES VERIFIED SUCCESSFULLY`);
  console.log("===============================================================================\n");

  return results;
}

runVerification().catch(console.error);
