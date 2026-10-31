import NextLink from 'next/link';
import type { ComponentProps } from 'react';

/** Telas privadas não ficam em cache: pré-carregar cada link só geraria carga no servidor. */
export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
