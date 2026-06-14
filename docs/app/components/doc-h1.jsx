'use client'

import CopyPage from './copy-page'

export default function DocH1(props) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '-0.5rem' }}>
        <CopyPage />
      </div>
      <h1 {...props} />
    </>
  )
}
