import { renderLayout } from '../layout.js';
import { sizeGuideTable } from '../components.js';
import { CONFIG } from '../config.js';
import { $, $$, money } from '../utils.js';

const settings = await renderLayout();
const { email, phone, location: address } = CONFIG.CONTACT;

$('#sizeHoodie').innerHTML = sizeGuideTable('hoodie');
$('#sizePunjabi').innerHTML = sizeGuideTable('punjabi');
$$('[data-fee="inside"]').forEach((el) => (el.textContent = money(settings.delivery_inside)));
$$('[data-fee="outside"]').forEach((el) => (el.textContent = money(settings.delivery_outside)));
$$('[data-bkash]').forEach((el) => (el.textContent = settings.bkash_number));

$('#cEmail').href = `mailto:${email}`;
$('#cEmail span').textContent = email;
$('#cPhone').href = `tel:${phone}`;
$('#cPhone span').textContent = phone;
$('#cLoc span').textContent = address;

if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
