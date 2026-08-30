/**
 * 이미지 업로드.
 *
 * 이슈트래커(test-system)와 같은 Cloudinary 계정·프리셋을 쓴다. 서명 없는(unsigned)
 * 프리셋이라 브라우저에서 바로 올라가고, 별도 서버가 필요 없다.
 */
const CLOUD_NAME = 'drz0oj86f'
const UPLOAD_PRESET = 'issue_tracker'

/** 너무 큰 파일은 올리기 전에 막는다 */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export async function uploadImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있어요.')
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`이미지가 너무 커요. ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB 아래로 줄여 주세요.`)
  }

  const form = new FormData()
  form.append('file', file)
  form.append('upload_preset', UPLOAD_PRESET)

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message ?? '이미지를 올리지 못했어요.')
  return data.secure_url as string
}
