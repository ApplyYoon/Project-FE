import { PlainLayout } from '@/components/layout/PlainLayout'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { VoicePledgePlayButton } from '@/components/ui/VoicePledgePlayButton'
import { useVoiceRecorder, type RecordedAudio } from '@/hooks/useVoiceRecorder'
import { getFirstMe } from '@/lib/firstMe'
import { loadData } from '@/lib/storage'
import {
  MAX_RECORD_SECONDS,
  PLEDGE_TEXT_MAX_LENGTH,
  formatSeconds,
  loadVoicePledge,
  saveVoicePledge,
} from '@/lib/voicePledge'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

/**
 * "처음의 나에게 한마디" 를 남기는 화면입니다. (주소: /onboarding/voice · #241)
 * 내 목소리로 30초까지 녹음하고, 글로도 한 줄 남길 수 있습니다. 둘 다 건너뛰어도 됩니다.
 *
 * - 가입 직후 맨 처음에 나옵니다. 끝나거나 건너뛰면 온보딩 질문(/onboarding)으로 갑니다.
 * - 설정의 "다시 남기기" 로 들어오면(주소 끝에 ?from=settings) 끝나고 설정으로 돌아갑니다.
 *
 * ⚠️ 녹음은 이 기기에만 저장합니다. 서버로 보내지 않습니다. (lib/voicePledge.ts)
 */
export function OnboardingVoicePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isFromSettings = searchParams.get('from') === 'settings'
  const exitPath = isFromSettings ? '/settings' : '/onboarding'

  // 전에 남긴 다짐이 있으면 그것으로 시작합니다. (설정에서 다시 들어온 경우)
  const [savedPledge] = useState(loadVoicePledge)
  // 지금 화면에 올라와 있는 녹음. 아직 녹음하지 않았으면 null 입니다.
  const [audio, setAudio] = useState<RecordedAudio | null>(() =>
    savedPledge?.audioDataUrl
      ? { dataUrl: savedPledge.audioDataUrl, seconds: savedPledge.seconds }
      : null,
  )
  // 글로 남기는 한마디. 온보딩에서 적은 "공부하는 이유" 가 있으면 미리 넣어 둡니다. (고쳐 써도 됩니다)
  // 가입 직후 처음 올 때는 아직 온보딩 전이라 빈 칸으로 시작합니다.
  const [text, setText] = useState(
    () =>
      savedPledge?.text ??
      getFirstMe(loadData<unknown>('onboarding-answers', null), new Date()).reason,
  )
  // 저장에 실패했을 때 보여줄 안내. 없으면 null
  const [saveError, setSaveError] = useState<string | null>(null)

  const recorder = useVoiceRecorder(setAudio)
  const isRecording = recorder.status === 'recording'
  // 녹음도 글도 없으면 저장할 것이 없습니다.
  const canSave = !isRecording && (audio !== null || text.trim() !== '')

  function handleSave() {
    if (!canSave) return
    const isSaved = saveVoicePledge({
      audioDataUrl: audio?.dataUrl ?? null,
      seconds: audio?.seconds ?? 0,
      text,
    })
    if (!isSaved) {
      // 저장 공간(5MB)이 가득 찼거나 저장소를 쓸 수 없는 경우입니다.
      setSaveError(
        '저장하지 못했어요. 이 기기의 저장 공간이 부족할 수 있어요. 녹음을 지우고 글만 남기면 저장될 수 있어요.',
      )
      return
    }
    navigate(exitPath)
  }

  return (
    <PlainLayout
      headerAction={
        // h-10: 글자는 작아도 누르는 영역은 40px 로 둡니다.
        <Link
          to={exitPath}
          className="text-brand inline-flex h-10 items-center text-sm font-medium underline underline-offset-4"
        >
          {isFromSettings ? '그만하고 설정으로' : '나중에 하기'}
        </Link>
      }
    >
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        <div>
          <p className="text-brand text-sm font-semibold">처음의 나</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
            처음의 나에게 한마디 남길래?
          </h1>
          <p className="mt-2 break-keep text-slate-600">
            그만두고 싶어질 때, 지금의 내 목소리를 다시 들려줄게요.{' '}
            {formatSeconds(MAX_RECORD_SECONDS)}까지 녹음돼요.
          </p>
        </div>

        {/* 녹음을 할 수 없는 브라우저에서는 녹음 상자를 아예 보여주지 않고, 아래의 글 칸만 씁니다. */}
        {recorder.isSupported && (
          <Card className="flex flex-col items-center gap-4 text-center">
            {recorder.status === 'denied' ? (
              // role="status": 안내가 뜨면 스크린리더가 읽어 줍니다.
              <p role="status" className="py-4 text-sm break-keep text-slate-600">
                마이크를 쓸 수 없어요. 브라우저 주소창 옆의 자물쇠에서 마이크를 허용하면 녹음할 수
                있어요. 아래에 글로 남겨도 돼요.
              </p>
            ) : isRecording ? (
              <>
                <p role="status" className="text-lg font-bold text-slate-900 tabular-nums">
                  {formatSeconds(recorder.seconds)} / {formatSeconds(MAX_RECORD_SECONDS)}
                </p>
                <ProgressBar value={(recorder.seconds / MAX_RECORD_SECONDS) * 100} />
                <p className="text-sm break-keep text-slate-500">
                  녹음하고 있어요. {formatSeconds(MAX_RECORD_SECONDS)}가 되면 저절로 멈춰요.
                </p>
                <Button variant="danger" size="lg" className="w-full" onClick={recorder.stop}>
                  ■ 녹음 멈추기
                </Button>
              </>
            ) : audio !== null ? (
              <>
                <VoicePledgePlayButton
                  audioDataUrl={audio.dataUrl}
                  seconds={audio.seconds}
                  label="들어 보기"
                  className="bg-brand hover:bg-brand-dark h-12 w-full text-base text-white"
                />
                <p className="text-sm font-medium text-slate-700 tabular-nums">
                  {formatSeconds(audio.seconds)} 녹음됨 · 최대 {formatSeconds(MAX_RECORD_SECONDS)}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="secondary" onClick={recorder.start}>
                    다시 녹음
                  </Button>
                  <Button variant="ghost" onClick={() => setAudio(null)}>
                    지우기
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm break-keep text-slate-600">
                  &quot;왜 시작했는지&quot;, &quot;힘들 때 나에게 해 주고 싶은 말&quot; 을 편하게
                  말해 보세요.
                </p>
                <Button size="lg" className="w-full" onClick={recorder.start}>
                  ● 녹음 시작
                </Button>
              </>
            )}
          </Card>
        )}

        <div className="flex flex-col gap-2">
          <Input
            id="pledge-text"
            label={recorder.isSupported ? '글로 남겨도 돼요' : '글로 한마디 남기기'}
            value={text}
            maxLength={PLEDGE_TEXT_MAX_LENGTH}
            placeholder="예) 하고 싶은 일을 하려고"
            onChange={(event) => setText(event.target.value)}
            className="h-12 text-base"
          />
          <p className="text-sm break-keep text-slate-500">
            🔒 녹음과 글은 이 기기에만 저장되고, 서버로 보내지 않아요.
          </p>
        </div>

        {saveError !== null && (
          <p role="alert" className="text-sm break-keep text-red-600">
            {saveError}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="lg"
            className="shrink-0"
            onClick={() => navigate(exitPath)}
          >
            {isFromSettings ? '취소' : '건너뛰기'}
          </Button>
          <Button size="lg" className="min-w-0 flex-1" disabled={!canSave} onClick={handleSave}>
            {isFromSettings ? '저장하기' : '저장하고 시작하기'}
          </Button>
        </div>
      </div>
    </PlainLayout>
  )
}
