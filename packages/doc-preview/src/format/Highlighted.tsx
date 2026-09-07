import { Fragment } from 'react'
import type { Token } from './highlight'

/**
 * Tokens become elements, never markup. Document content reaches the DOM only as
 * text children, so nothing in the file can be interpreted as HTML.
 */
export function Highlighted({ tokens }: { tokens: Token[] }) {
  return (
    <>
      {tokens.map((token, index) =>
        token.type === 'plain' ? (
          <Fragment key={index}>{token.value}</Fragment>
        ) : (
          <span key={index} className={`dp-tok dp-tok--${token.type}`}>
            {token.value}
          </span>
        ),
      )}
    </>
  )
}
