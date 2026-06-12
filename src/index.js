// src/index.js
// 心臓部: Gemini 2.5 Flash APIを呼び出し、Instagram用の文章を生成する処理

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/generate" && request.method === "POST") {
      const GEMINI_API_KEY = env.GEMINI_API_KEY;

      try {
        const body = await request.json();
        const { imageBase64, languages, persona } = body;

        if (!imageBase64) {
          return new Response(JSON.stringify({ error: "画像がありません。" }), { status: 400 });
        }

        const currentMonth = new Date().getMonth() + 1;

        const systemPrompt = `
          あなたは世界トップクラスの飲食・SNSマーケターであり、${persona}です。
          現在 ${currentMonth}月 です。この季節感や旬の要素を自然に取り入れてください。

          【写真分析の指示 - 最重要】
          提供された料理写真を以下の項目で超詳細に分析してください。
          ①料理名・食材：写真に写っている料理名と主な食材を特定してください。器や看板の文字、メニュー名が見えればOCRで読み取り、特定に活用してください。
          ②調理法の視覚的特徴：照り、焼き色、湯気、とろみ、揚げ色、生の鮮度感など、見た目からわかる特徴を読み取ってください。
          ③盛り付け・器：器の素材（陶器・漆器・ガラスなど）、色、盛り付けの美しさを読み取ってください。
          ④色彩と質感：食欲をそそる色彩（赤み、ツヤ、こんがり感など）を言葉で表現してください。
          
          上記で分析した結果を必ずキャプション文に反映させ、見たままのシズル感を最大限に表現してください。

          【必須条件】
          ・出力言語: ${languages.join(", ")} のみ。それ以外の言語は絶対に出力しないでください。
          ・指定された言語が日本語のみの場合、英語・中国語・韓国語は一切出力禁止です。
          ・外国語が指定された場合はインバウンド向けにマーケティング意訳してください。
          ・各言語の末尾にハッシュタグを5〜8個つけてください。

          【超重要：出力形式に関する厳格なルール】
          必ず指定のJSON形式（キーが言語名、値がテキスト）のみを出力してください。
          「わかりました」「以下に出力します」などの前置き、挨拶、説明、Markdown記法は【一切禁止】です。波括弧 {} から始まる純粋なJSON文字列だけを返してください。
        `;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const geminiPayload = {
          system_instruction: { parts: { text: systemPrompt } },
          contents: [{
            parts: [
              { text: "この料理写真をプロの視点で分析し、Instagram投稿文を作成してください。" },
              { inline_data: { mime_type: "image/jpeg", data: imageBase64 } }
            ]
          }],
          generationConfig: { responseMimeType: "application/json" }
        };

        const response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiPayload)
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Gemini API Error: ${response.status} - ${err}`);
        }

        const result = await response.json();

        if (!result.candidates || result.candidates.length === 0) {
          throw new Error("Geminiからの返答にcandidatesがありませんでした。");
        }

        const finishReason = result.candidates[0].finishReason;
        if (finishReason && finishReason !== "STOP") {
          throw new Error(`Geminiが正常に応答できませんでした。理由: ${finishReason}`);
        }

        if (!result.candidates[0].content || !result.candidates[0].content.parts?.[0]?.text) {
          throw new Error("Geminiの返答形式が予期せぬものでした。");
        }

        const generatedText = result.candidates[0].content.parts[0].text;

        let parsedCheck;
        try {
          const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("JSON形式が見つかりません。");
          parsedCheck = JSON.parse(jsonMatch[0]);
        } catch {
          throw new Error("AIが正しいJSON形式で返答しませんでした。もう一度お試しください。");
        }

        // 【改善】二重パースを防ぐため、チェックを通過したクリーンなJSONのみを返す
        return new Response(JSON.stringify(parsedCheck), {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500, 
          headers: { "Content-Type": "application/json" } 
        });
      }
    }

    return env.ASSETS.fetch(request);
  }
};
