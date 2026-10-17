import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { VoicePledgePlayButton } from '@/components/ui/VoicePledgePlayButton'
import { CALL_TIME_STORAGE_KEY, parseCallTime } from '@/lib/callReminder'
import { loadData } from '@/lib/storage'
import { ANALYSIS_PATH } from '@/lib/tabMenu'
import { loadVoicePledge } from '@/lib/voicePledge'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * 상담 탭 화면(/counsel)입니다. AI 와 이야기하는 곳(통화·일기·다짐 듣기)으로 가는 입구를 모아 둡니다. (#386)
 * 오늘의 통화 카드·지난 요약·채팅까지 넣은 진짜 상담 화면은 #406 에서 만듭니다.
 */
export function CounselPage() {
  const navigate = useNavigate()
  // 설정에서 정한 전화 받을 시간 ('HH:MM'). 안 정했거나 값이 이상하면 빈 글자입니다.
  const [callTime] = useState(() => {
    const saved = loadData<unknown>(CALL_TIME_STORAGE_KEY, '')
    return typeof saved === 'string' && parseCallTime(saved) !== null ? saved : ''
  })
  // 설정 화면에서 켠 사람에게만 일기를 보여줍니다. (#63)
  const [isDiaryEnabled] = useState(() => loadData('diary-enabled', false))
  // 처음에 녹음해 둔 다짐. 없으면 null (lib/voicePledge.ts)
  const [voicePledge] = useState(loadVoicePledge)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">상담</h1>

      {/* 모바일은 한 줄에 하나, PC 는 두 칸으로 카드를 놓습니다. */}
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <Card title="오늘의 통화">
          <p className="text-sm break-keep text-slate-600">
            {callTime === ''
              ? '아직 전화 받을 시간을 정하지 않았어요. 설정에서 정하면 그 시간에 AI 선생님이 전화해요.'
              : `매일 ${callTime} 에 AI 선생님이 전화해요.`}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button className="w-full sm:w-auto" onClick={() => navigate('/call')}>
              지금 통화하기
            </Button>
            {callTime === '' && (
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => navigate('/settings')}
              >
                시간 정하기
              </Button>
            )}
          </div>
        </Card>

        <Card title="지난 통화 요약">
          <p className="text-sm break-keep text-slate-600">지금은 분석 탭의 기록에 모여 있어요.</p>
          <Button
            variant="secondary"
            className="mt-4 w-full sm:w-auto"
            onClick={() => navigate(ANALYSIS_PATH)}
          >
            요약 보러 가기
          </Button>
        </Card>

        {voicePledge?.audioDataUrl && (
          <Card title="처음의 다짐">
            <p className="text-sm break-keep text-slate-600">처음에 내 목소리로 남긴 다짐이에요.</p>
            <VoicePledgePlayButton
              audioDataUrl={voicePledge.audioDataUrl}
              seconds={voicePledge.seconds}
              label="다짐 듣기"
              className="mt-4 w-full sm:w-auto"
            />
          </Card>
        )}

        {isDiaryEnabled && (
          <Card title="일기">
            <p className="text-sm text-slate-600">원할 때만 쓰는 자유 일기예요.</p>
            <Button className="mt-4 w-full sm:w-auto" onClick={() => navigate('/diary')}>
              일기 쓰러 가기
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}
