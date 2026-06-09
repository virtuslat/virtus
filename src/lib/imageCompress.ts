// Comprime una imagen en el navegador antes de subirla (ahorra datos y acelera).
// Redimensiona al lado máximo indicado y baja la calidad JPEG.
export async function compressImage(
  file: File,
  maxDim = 1280,
  quality = 0.7
): Promise<File> {
  // Si no es imagen o el entorno no soporta canvas, devolver el original
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) return file
  // GIF: no comprimir (se perdería la animación)
  if (file.type === 'image/gif') return file

  try {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const img: HTMLImageElement = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = dataUrl
    })

    let { width, height } = img
    if (width > maxDim || height > maxDim) {
      if (width >= height) {
        height = Math.round((height * maxDim) / width)
        width = maxDim
      } else {
        width = Math.round((width * maxDim) / height)
        height = maxDim
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, width, height)

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
    )
    if (!blob) return file

    // Si por alguna razón quedó más grande, usar el original
    if (blob.size >= file.size) return file

    const newName = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], newName, { type: 'image/jpeg' })
  } catch {
    return file
  }
}
