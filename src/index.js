// src/index.js

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

        // 【画像認識を極限まで強化したシステムプロンプト】
        const systemPrompt = `
          あなたは世界トップクラスの飲食・SNSマーケターであり、${persona}です。
          現在 ${currentMonth}月 です。この季節感や旬の要素を自然に取り入れてください。

          【超重要：写真分析の指示】
          提供された料理写真を、プロの料理人の目で超詳細に分析してください：
          1. メイン食材は何か？（例：マグロ、ウナギ、カフェラテなど）
          2. 調理法や状態はどう見えるか？（例：炭火の焦げ目、タレの照りやツヤ、身のふっくら感、湯気、新鮮な脂の乗りなど）
          3. 盛り付けや器、背景の雰囲気はどうなっているか？
          
          上記で分析した「写真に写っている視覚的特徴（特に照り、ふっくら感、焼き色などの美味しそうな部分）」を【必ず】キャプションの文章内に「まるで写真から香りが漂うかのように」具体的に描写してください。見たままの特徴を文章に入れることで、写真とキャプションの説得力を最大化します。

          【必須条件】
          ・出力言語: ${languages.join(", ")}
          ・インバウンド（外国人観光客）向けに魅力的なマーケティング意訳を行ってください。日本の食文化へのリスペクトを含めるとなお良いです。
          ・必ず指定のJSON形式（キーが言語名、値がテキスト）で出力してください。ハッシュタグも各言語で5〜8個末尾に含めてください。
        `;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        
        const geminiPayload = {
          system_instruction: { parts: { text: systemPrompt } },
          contents: [{
            parts: [
              { text: "この料理写真をプロの視点で分析し、シズル感（美味しさ）あふれるInstagram投稿文を作成してください。" },
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

    return env.ASSETS.fetch(request);
  }
};
