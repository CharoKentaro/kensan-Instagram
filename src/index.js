// 心臓部: Gemini 2.5 Flash APIを呼び出すワーカープログラム

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 画面（フロントエンド）から「/api/generate」宛てにリクエストが来たら、Geminiの処理を実行する
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
          あなたはプロのSNSマーケターであり、${persona}です。
          現在 ${currentMonth}月 です。季節感を取り入れつつ、料理写真の魅力を伝えるInstagramキャプションを作成してください。
          
          【必須条件】
          ・出力言語: ${languages.join(", ")}
          ・インバウンド向けに魅力的なマーケティング意訳を行ってください。
          ・必ず指定のJSON形式（キーが言語名、値がテキスト）で出力してください。
        `;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const geminiPayload = {
          system_instruction: { parts: { text: systemPrompt } },
          contents: [{
            parts: [
              { text: "この料理写真を分析してください。" },
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
        const generatedText = result.candidates[0].content.parts[0].text;

        return new Response(generatedText, {
          headers: { "Content-Type": "application/json" }
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500, 
          headers: { "Content-Type": "application/json" } 
        });
      }
    }

    // 「/api/generate」以外へのアクセス（通常のホームページ表示）は、
    // wrangler.tomlで設定した [assets] (public/index.html) に任せるため、そのまま通します。
    return env.ASSETS.fetch(request);
  }
};
