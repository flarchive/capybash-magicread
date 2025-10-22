import app from 'flarum/admin/app';
import MagicReadPage from './components/MagicReadPage';

app.initializers.add('capybash-magicread', () => {
  app.extensionData.for('capybash-magicread').registerPage(MagicReadPage);
});