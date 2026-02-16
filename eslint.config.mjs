import antfu from '@antfu/eslint-config'

export default antfu({
  react: true,
  typescript: true,
  nextjs: true,
  ignores: [
    'docs/**',
    'data/**',
  ],
}, {
  rules: {
    'node/prefer-global/process': 'off',
  },
})
