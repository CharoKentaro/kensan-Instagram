// 心臓部: Gemini 2.5 Flash APIを呼び出し、Instagram用の文章を生成する処理

export async function onRequestPost(context) {
  // 1. 環境変数（Cloudflareに登録した鍵）を取得
  const GEMINI_API_KEY = context.env.GEMINI_API_KEY;

  try {
    // 2. フロントエンド（画面）から送られてきたデータ（画像、言語、ペルソナ）を受け取る
    const body = await context.request.json();
    const { imageBase64, languages, persona } = body;

    // 画像が送られていない場合のエラー処理
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "画像がアップロードされていません。" }), { status: 400 });
    }

    // 3. Kさんのために自動で季節感を組み込む
    const currentMonth = new Date().getMonth() + 1;

    // 4. Geminiへの指示書（システムプロンプト）
    const systemPrompt = `
      あなたはプロのSNSマーケターであり、${persona}です。
      現在 ${currentMonth}月 です。この季節感や旬の要素を自然に取り入れつつ、
      アップロードされた料理の写真を分析し、シズル感（美味しさ）が伝わるInstagramキャプションを作成してください。
      
      【必須条件】
      ・以下の言語すべてで出力してください: ${languages.join(", ")}
      ・外国語（英語・中国語・韓国語など）へ翻訳する際は、直訳ではなく、インバウンド観光客が来店したくなるようなマーケティング意訳を行ってください。
      ・出力は必ず以下の形式のJSONデータで返してください。
      {
        "日本語": "日本語のテキスト...",
        "English": "英語のテキスト..."
      }
    `;

    // 5. Gemini 2.5 Flash APIへのリクエストデータを作成
    // ※GeminiのVision仕様に合わせたフォーマットです
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const geminiPayload = {
      system_instruction: {
        parts: { text: systemPrompt }
      },
      contents: [{
        parts: [
          { text: "この料理の写真を分析して、キャプションを作成してください。" },
          {
            inline_data: {
              mime_type: "image/jpeg", // フロントエンドでJPEGに変換して送る想定
              data: imageBase64
            }
          }
        ]
      }],
      // JSONで返すように強制する設定
      generationConfig: {
        responseMimeType: "application/json",
      }
    };

    // 6. Gemini APIを呼び出す
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // 7. Geminiの独自のレスポンス形式から、テキスト部分だけを安全に抜き出す
    if (!result.candidates || !result.candidates[0].content || !result.candidates[0].content.parts) {
      throw new Error("Geminiからの返答が予期せぬ形式でした。");
    }

    const generatedText = result.candidates[0].content.parts[0].text;

    // 8. 画面（フロントエンド）にJSONとして結果を返す
    return new Response(generatedText, {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" // CORS対応
      }
    });

  } catch (error) {
    console.error("生成エラー:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}
