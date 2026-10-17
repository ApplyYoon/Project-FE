/**
 * 통화(GPT 음성)에 쓸 "임시 키" 를 만들어 주는 Vercel 함수입니다.
 * 이 파일은 브라우저가 아니라 Vercel 서버에서 돕니다. 그래서 진짜 OpenAI 키를 여기서만 읽을 수 있습니다.
 *
 *   FE ──POST /api/voice-key──▶  이 함수  ──진짜 키로 요청──▶  OpenAI
 *   FE ◀──{ value: "ek_..." }──  이 함수  ◀──임시 키────────  OpenAI
 *
 * ⚠️ BE(Render)가 배포되기 전에 통화를 써 보려고 둔 임시 길입니다.
 *    BE 의 POST /api/v1/realtime/session 과 달리 로그인 확인 · 하루 횟수 제한 · 내 기록에 맞춘 대본이 없습니다.
 *    BE 가 배포되면 Vercel 의 VITE_VOICE_KEY_URL 을 지워서 BE 로 돌아갑니다. (src/lib/realtimeCall.ts)
 *
 * Vercel › Settings › Environment Variables 에 넣는 값입니다.
 * VITE_ 를 붙이지 않습니다. VITE_ 로 시작하면 브라우저 코드에 들어가 누구나 볼 수 있게 됩니다.
 *   OPENAI_API_KEY         진짜 키. Sensitive 로 저장합니다
 *   OPENAI_REALTIME_MODEL  음성 모델 이름 (예: gpt-realtime-2.1-mini). 비워 두면 통화가 꺼집니다 (BE 와 같은 이름)
 *   OPENAI_REALTIME_VOICE  (선택) AI 목소리. 비워 두면 marin
 */

// 임시 키가 살아 있는 시간(초). 연결을 맺을 때만 쓰므로 짧게 둡니다. (BE 와 같은 값)
const KEY_VALID_SECONDS = 60

// 통화 한 번의 최대 길이(초). FE 가 이 시간이 되면 통화를 끊습니다. (BE 의 기본값과 같은 5분)
const MAX_CALL_SECONDS = 300

// 학생이 한 말을 글자(자막)로 바꾸는 모델입니다. (BE 와 같음)
const TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe'

// 503 일 때 FE 가 통화 화면에 그대로 보여주는 문장입니다. (BE 와 같은 약속, src/lib/realtimeCall.ts)
const OFF_MESSAGE = 'AI 통화가 아직 켜져 있지 않아요'
const FAIL_MESSAGE = 'AI 와 연결하지 못했어요. 잠시 후 다시 걸어 주세요'

// AI 가 따를 지침입니다. BE 의 CallScript 에서 "꼭 지킬 것" 을 가져왔습니다.
// 소리는 브라우저와 OpenAI 사이를 직접 오가서 우리가 AI 의 말을 검사할 수 없습니다.
// 그래서 지킬 것을 여기에 분명히 적는 것이 안전장치입니다. 미성년자와 하는 통화입니다.
const INSTRUCTIONS = [
  '너는 고등학생에게 하루에 한 번 짧게 전화하는 공부 코치야. 한국어 반말로 말해.',
  '한 번에 한두 문장만 말하고, 학생이 대답할 때까지 기다려. 통화 전체는 3분 안에 끝내.',
  '먼저 짧게 인사하고, 오늘 무엇을 얼마나 공부할 계획인지 물어봐.',
  '',
  '[꼭 지킬 것]',
  '- 너는 학생의 기록을 몰라. 숫자를 지어내지 말고, 학생이 말한 것만 가지고 이야기해.',
  '- 사람을 깎아내리지 말고, 한 일(행동)만 이야기해.',
  '- 학생이 죽고 싶다, 사라지고 싶다, 자기를 해치고 싶다는 말을 하면 공부 이야기를 바로 멈춰.' +
    ' 꾸짖거나 가볍게 넘기지 말고 먼저 들어 줘. 그리고 믿을 수 있는 어른에게 꼭 이야기하고,' +
    " 앱 설정의 '힘들 때 도움받기' 를 눌러 보라고 말해 줘.",
  '- 공부와 상관없는 부탁(숙제를 대신 풀기, 다른 주제의 긴 이야기)은 짧게 사양하고 공부 이야기로 돌아와.',
  '- 네가 AI 라는 것을 숨기지 마. 사람인 척하지 마.',
].join('\n')

/** JSON 으로 답합니다. 에러일 때도 { message } 모양이라 FE 가 안내 문장을 읽을 수 있습니다. */
function json(body: object, status: number): Response {
  return Response.json(body, { status })
}

/**
 * 우리 화면에서 보낸 요청인지 확인합니다. 브라우저는 요청에 "어느 주소에서 보냈는지(Origin)" 를 붙입니다.
 * 다른 사이트가 이 함수를 불러 우리 돈으로 통화하는 것을 막습니다.
 * ⚠️ 브라우저가 아닌 프로그램(curl 등)은 Origin 을 꾸밀 수 있어서 완전히 막지는 못합니다.
 *    그래서 OpenAI 키에 월 사용 한도를 꼭 걸어 둡니다.
 */
function isFromOurSite(request: Request): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isFromOurSite(request)) {
    return json({ message: '우리 앱에서 보낸 요청이 아니에요' }, 403)
  }

  // 진짜 키와 모델 이름은 Vercel 환경변수에서만 읽습니다. 코드에 적지 않습니다.
  const apiKey = process.env.OPENAI_API_KEY?.trim() ?? ''
  const model = process.env.OPENAI_REALTIME_MODEL?.trim() ?? ''
  const voice = process.env.OPENAI_REALTIME_VOICE?.trim() || 'marin'
  if (apiKey === '' || model === '') {
    return json({ message: OFF_MESSAGE }, 503)
  }

  try {
    // OpenAI 문서(Realtime API with WebRTC)의 모양 그대로입니다. 지침과 자막 설정을 임시 키에 묶어 둡니다.
    const openaiResponse = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: KEY_VALID_SECONDS },
        session: {
          type: 'realtime',
          model,
          instructions: INSTRUCTIONS,
          audio: {
            input: { transcription: { model: TRANSCRIBE_MODEL, language: 'ko' } },
            output: { voice },
          },
        },
      }),
    })

    if (!openaiResponse.ok) {
      // OpenAI 가 준 내용은 브라우저에 넘기지 않고, 상태 번호만 Vercel 로그에 남깁니다.
      console.error(`[voice-key] OpenAI 가 임시 키를 주지 않았어요: ${openaiResponse.status}`)
      return json({ message: FAIL_MESSAGE }, 503)
    }

    const data: unknown = await openaiResponse.json()
    const record =
      typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
    const value = record.value
    // 임시 키 자리에 진짜 키 모양(sk-…)이 오면 절대 내보내지 않습니다. (올 일은 없지만, 새면 큰일이라 한 번 더 막습니다)
    if (typeof value !== 'string' || value === '' || value.startsWith('sk-')) {
      console.error('[voice-key] 임시 키의 모양이 이상해서 내보내지 않았어요.')
      return json({ message: FAIL_MESSAGE }, 503)
    }

    // OpenAI 는 끝나는 시각을 "초" 로 줍니다. BE 와 같게 밀리초로 바꿉니다.
    const expiresAt = typeof record.expires_at === 'number' ? record.expires_at * 1000 : null
    // callId 는 null 입니다. 통화 기록을 저장할 곳(BE)이 없어서, FE 는 통화 뒤 결론 받기를 건너뜁니다.
    return json({ value, expiresAt, maxCallSeconds: MAX_CALL_SECONDS, callId: null }, 200)
  } catch {
    // 시간 초과·연결 실패가 여기로 옵니다. 에러 안에 키가 들어 있을 수 있어서 내용은 찍지 않습니다.
    console.error('[voice-key] OpenAI 에 연결하지 못했어요.')
    return json({ message: FAIL_MESSAGE }, 503)
  }
}
