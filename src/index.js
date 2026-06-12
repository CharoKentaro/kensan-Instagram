// src/index.js

export default {
  // ===== 1. 通常のWebアクセスやAPIリクエストの処理 =====
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // AI文章生成（一切変更なし・デグレ防止）
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

    // Instagram自動投稿（MIMEタイプに完全対応！）
    if (url.pathname === "/api/post" && request.method === "POST") {
      try {
        const body = await request.json();
        const { imageBase64, caption, mimeType } = body; // フロントからMIMEタイプ（PNGかJPEGか）を受け取る

        if (!imageBase64 || !caption) {
          return new Response(JSON.stringify({ error: "画像または文章がありません。" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }

        const imageMime = mimeType || "image/jpeg"; // 指定がなければデフォルトはJPEG
        const extension = imageMime.split("/")[1] || "jpg";

        // Step1: base64をバイナリに変換
        const imageBytes = Uint8Array.from(atob(imageBase64), c => c.charCodeAt(0));

        // Step2: R2に一時保存（拡張子を動的に合わせる）
        const fileName = `post-${Date.now()}.${extension}`;
        await env.IMAGE_BUCKET.put(fileName, imageBytes, {
          httpMetadata: { contentType: imageMime }
        });

        // Step3: R2のパブリックURLを組み立て
        const imageUrl = `https://${env.R2_PUBLIC_DOMAIN}/${fileName}`;

        // Step4: 金庫（KV）からInstagram長期アクセストークンを自動読み込み！
        const accessToken = await env.TOKEN_STORE.get("INSTAGRAM_ACCESS_TOKEN");
        if (!accessToken) {
          throw new Error("データベース(KV)内にInstagramアクセストークンが見つかりません。");
        }
        
        const igUserId = env.IG_USER_ID;

        // Meta Graph APIでコンテナ作成
        const containerRes = await fetch(
          `https://graph.facebook.com/v25.0/${igUserId}/media`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              image_url: imageUrl,
              caption: caption,
              access_token: accessToken
            })
          }
        );

        if (!containerRes.ok) {
          const err = await containerRes.text();
          throw new Error(`Instagram コンテナ作成エラー: ${err}`);
        }

        const containerData = await containerRes.json();
        const creationId = containerData.id;

        if (!creationId) {
          throw new Error("InstagramのコンテナIDを取得できませんでした。");
        }

        // Step5: 実際にInstagramに投稿する
        const publishRes = await fetch(
          `https://graph.facebook.com/v25.0/${igUserId}/media_publish`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              creation_id: creationId,
              access_token: accessToken
            })
          }
        );

        if (!publishRes.ok) {
          const err = await publishRes.text();
          throw new Error(`Instagram 公開エラー: ${err}`);
        }

        const publishData = await publishRes.json();

        // Step6: 投稿成功後、R2の画像を削除して自動お掃除
        ctx.waitUntil(env.IMAGE_BUCKET.delete(fileName));

        return new Response(JSON.stringify({ success: true, postId: publishData.id }), {
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
  },

  // ===== 2. 【新規追加】タイマー（Cron）が起動した時の自動更新処理 =====
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        // 金庫（KV）から、現在の古い長期トークンを読み込む
        const currentToken = await env.TOKEN_STORE.get("INSTAGRAM_ACCESS_TOKEN");
        if (!currentToken) return;

        // MetaのAPIを叩いて、有効期限をさらに60日延長（リフレッシュ）する
        const url = `https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${env.CF_API_TOKEN}&client_secret=${env.INSTAGRAM_APP_SECRET}&fb_exchange_token=${currentToken}`;
        
        const response = await fetch(url);
        if (!response.ok) {
          console.error("トークン自動更新エラー:", await response.text());
          return;
        }

        const data = await response.json();
        const newToken = data.access_token;

        if (newToken) {
          // 新しいトークンを金庫（KV）に上書き保存！
          await env.TOKEN_STORE.put("INSTAGRAM_ACCESS_TOKEN", newToken);
          console.log("Instagramアクセストークンを自動更新しました！");
        }
      } catch (err) {
        console.error("Cron自動更新システムでエラーが発生しました:", err);
      }
    })());
  }
};
