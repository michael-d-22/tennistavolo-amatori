declare module '*.png' {
  const src: string
  export default src
}

declare module '*?inline' {
  const dataUrl: string
  export default dataUrl
}
