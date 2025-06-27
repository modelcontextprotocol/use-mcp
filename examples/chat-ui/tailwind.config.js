/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            pre: {
              padding: '0',
              filter: 'brightness(96%)',
              border: '0',
              backgroundColor: 'transparent',
            },
            lineHeight: '1.5',
            h1: {
              marginTop: '1rem',
              marginBottom: '0.5rem',
            },
            h2: {
              marginTop: '1rem',
              marginBottom: '0.5rem',
            },
            h3: {
              marginTop: '0.75rem',
              marginBottom: '0.5rem',
            },
            h4: {
              marginTop: '0.75rem',
              marginBottom: '0.5rem',
            },
            h5: {
              marginTop: '0.75rem',
              marginBottom: '0.5rem',
            },
            h6: {
              marginTop: '0.75rem',
              marginBottom: '0.5rem',
            },
            p: {
              marginTop: '0.5rem',
              marginBottom: '0.5rem',
            },
            ul: {
              marginTop: '0.5rem',
              marginBottom: '0.5rem',
            },
            ol: {
              marginTop: '0.5rem',
              marginBottom: '0.5rem',
            },
            li: {
              marginTop: '0.25rem',
              marginBottom: '0.25rem',
            },
            blockquote: {
              marginTop: '0.5rem',
              marginBottom: '0.5rem',
            },
          },
        },
      },
    },
  },
}
