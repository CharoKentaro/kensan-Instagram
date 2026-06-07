// src/index.js
// 心臓部: Gemini 2.5 Flash APIを呼び出し、Instagram用の文章を生成する処理

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 画面（フロントエンド）から「/api/generate」宛てにリクエストが来たら実行
    if (url.pathname === "/api/generate" && request.method === "POST") {
      const GEMINI_API_KEY = env.GEMINI_API_KEY;

      try {
        const body = await request.json();
        const { imageBase64, languages, persona } = body;

        // 画像が送られていない場合のエラー処理
        if (!imageBase64) {
          return new Response(JSON.stringify({ error: "画像がありません。" }), { status: 400 });
        }

        // Kさんのために自動で季節感を組み込む
        const currentMonth = new Date().getMonth() + 1;

        // 【画像認識を極限まで強化したシステムプロンプト】
        const systemPrompt = `
          あなたは世界トップクラスの飲食・SNSマーケターであり、${persona}です。
          現在 ${currentMonth}月 です。この季節感や旬の要素を自然に取り入れてください。

          【写真分析の指示】
          提供された料理写真を分析し、メイン食材、調理法（照り、焼き色、湯気など）、盛り付けを具体的に文章に組み込んでください。見たままのシズル感を最大限に表現してください。

          【必須条件】
          ・出力言語: ${languages.join(", ")}
          ・外国語はインバウンド向けにマーケティング意訳してください。
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

    // 「/api/generate」以外へのアクセスは、ホームページ（index.html）として表示
    return env.ASSETS.fetch(request);
  }
};
