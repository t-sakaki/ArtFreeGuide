import urllib.request
import json

nvidia_key = "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"
url = "https://integrate.api.nvidia.com/v1/chat/completions"

prompt = """以下の美術解説テキストを分析し、改善点や追加で深掘りできる質問・提案を最大3つ作成してください。

【分析対象テキスト】
モナ・リザはレオナルド・ダ・ヴィンチの代表作です。スフマート技法が用いられています。

【出力形式】
JSONオブジェクトのみ返してください。

{
  "suggestions": [
    {
      "type": "fix_format",
      "icon": "💡",
      "message": "簡潔な説明",
      "action": "expand_content"
    }
  ]
}"""

data = {
    "model": "meta/llama-3.1-70b-instruct",
    "messages": [{"role": "user", "content": prompt}],
    "temperature": 0.2,
    "response_format": {"type": "json_object"}
}

req = urllib.request.Request(
    url,
    data=json.dumps(data).encode('utf-8'),
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {nvidia_key}"
    }
)

try:
    with urllib.request.urlopen(req) as resp:
        print("LLAMA-3.1-70B SUCCESS:")
        res_str = resp.read().decode('utf-8')
        res_json = json.loads(res_str)
        print(res_json["choices"][0]["message"]["content"])
except Exception as e:
    if hasattr(e, 'read'):
        print("ERROR:", e, e.read().decode('utf-8'))
    else:
        print("ERROR:", e)
