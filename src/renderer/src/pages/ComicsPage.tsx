import MangaPage from './MangaPage'

export default function ComicsPage(): JSX.Element {
  return (
    <MangaPage
      category="comics"
      pageTitle="Comics"
      emptyMessage="No comics found. Add .cbz, .cbr, .epub or .pdf files to media/comics/ and scan your library."
    />
  )
}
