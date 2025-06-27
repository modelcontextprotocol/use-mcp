/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-body': '14px',
            h1: {
              marginTop: '1em',
              marginBottom: '0.5em',
            },
            h2: {
              marginTop: '1em',
              marginBottom: '0.5em',
            },
            h3: {
              marginTop: '1em',
              marginBottom: '0.5em',
            },
            ul: {
              marginTop: '0.5em',
              marginBottom: '0.5em',
            },
            ol: {
              marginTop: '0.5em',
              marginBottom: '0.5em',
            },
            pre: {
              padding: '0',
              filter: 'brightness(96%)',
              border: '0',
              backgroundColor: 'transparent',
            },
          },
        },
      },
    },
  },
}
