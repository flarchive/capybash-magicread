import app from 'flarum/admin/app';
export { default as extend } from './extend';

app.initializers.add('capybash-magicread', () => {
  console.log('[MagicRead] Admin initialized');
});