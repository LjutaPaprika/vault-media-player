// Run with: node --test   (from tools/manga-dl)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isNonPageImage } from './filter.js'

test('real pages are kept, including random image-host IDs that contain filter words', () => {
  for (const url of [
    'https://i.imgur.com/ntlogO4.png',                       // "logO" inside an imgur ID (Three Days of Happiness ch 9 p25)
    'https://i.imgur.com/EBvPnH9.png',
    // Blogger IDs from Kagurabachi ch 67 / ch 46 and Centuria ch 9 ("-AD8s_", "_azR7", "_ad_")
    'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEjQAU_JvuNxJVOv2xyqxLcdKlEK7s2ObDWzxQeW4WQsTyjeXOgFCGtfi10A409Lcp2Z7Kns450JC74Hz8NhKo_1kRgSYLKl7Q0OYMbSgUTHHEn1xOrwwtAxcCpHAF2iPmv17mKT-AD8s_oE_4Fn4MDl4J4vZglJgA9Lpy1Fc3SH9f-FE-XyCBtuZdvoYd1o/s1600/006.jpg',
    'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEiQo_vLgE0mO44yHF5ISzY_azR7enUsKBx4Y35MPpUVD3h0pAou8Odp-9gUWzU0R7PuTjLLh5XtA3IDO6WHgWXZMy4-KdsvpWrWiw45iO8KzqQ6KaP4Iv7TJZKfUslDXgbcMTr3PVIHMqzf-aDS6Ab_v6Zkjp4AbUYg_rcbh3MoSvuGaBp3q1Yet2PZ3e3p/s1600/008.jpg',
    'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEgPRaD2X4yqUIc7MQOdNWeZHMrKzDwbLoqjk9qhtQ8Wsg9V5kzpFqvPXhyRbwQLN_0K4lFEW2dQeoMdXbpEcxNCbGF-KT1p7_ad_ImkbzyqWH_C0DRW4BVB44uq_i_INDp7-oJr9fjuhFheatOXHE2IlU6jP-IYWA7_rqT39gTw5js7Ine3cO4m2U3WtcQ/s1757/21.png',
    'https://cdn.example.com/wp-content/uploads/2024/05/page-01.jpg',
    'https://site.com/manga/padawan-chapter-1/01.jpg',
    'https://site.com/uploads/iconic-cover.jpg',
    'https://iconmanga.com/chapter-3/04.webp',               // filter word in the domain only
    'https://site.com/read/blank-check-chapter-2/05.jpg',    // series title with "blank" inside a longer part
    'not a url',
  ]) assert.equal(isNonPageImage(url), false, url)
})

test('logos, icons, ads and other site furniture are skipped', () => {
  for (const url of [
    'https://site.com/images/logo.png',
    'https://site.com/img/site-logo-2x.png',
    'https://site.com/icons/fav.png',
    'https://site.com/ads/banner728.gif',
    'https://site.com/ad/x.jpg',
    'https://site.com/img/loading-spinner.gif',
    'https://site.com/theme/avatar_default.png',
    'https://site.com/pixel.gif?id=3',
    'https://site.com/assets/placeholder.svg',
    'https://site.com/wp/blank.gif',
    'https://site.com/ui/button2.png',
  ]) assert.equal(isNonPageImage(url), true, url)
})
