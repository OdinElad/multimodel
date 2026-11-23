# Play Console: תשובות מוכנות למילוי (Tahazit)

עודכן: 24.11.2026. מבוסס על privacy.html ועל הקוד הנוכחי.

## 1. פרטי האפליקציה (Create app)
- App name: Tahazit: Weather Forecast
- Default language: English (United States) en-US. את העברית ושאר השפות מוסיפים כתרגומים מ-play/listing.md
- App or game: App
- Free or paid: Free
- להסכים להצהרות (Developer Program Policies, US export laws)

## 2. Store listing
- טקסטים: play/listing.md (7 שפות, שמות עד 30 תווים, תיאור קצר עד 80)
- App icon 512x512: android/store_icon.png
- Feature graphic 1024x500: play/feature_graphic.png
- Phone screenshots: לפחות 2 (מומלץ 4 עד 6), מהטלפון שלך: מסך ראשי, גרף מודלים, תחזית סערות, הגדרות התראות
- Category: Weather
- Contact email: angel.elaad@gmail.com
- Website: https://odinelad.github.io/multimodel/

## 3. App content (Policy > App content)
| סעיף | תשובה |
| --- | --- |
| Privacy policy | https://odinelad.github.io/multimodel/privacy.html |
| Ads | No, my app does not contain ads |
| App access | All functionality is available without special access |
| Content rating | ראו סעיף 4 |
| Target audience | 18 and over (האפליקציה לא מיועדת לילדים ולא תוכננה עבורם) |
| News app | No |
| Government app | No |
| Financial features | My app doesn't provide any financial features |
| Health | No health features |
| Data safety | ראו סעיף 5 |

## 4. Content rating (שאלון IARC)
- Email: angel.elaad@gmail.com
- Category: All Other App Types (או Utility/Productivity, לפי מה שמוצג)
- אלימות, מין, שפה גסה, סמים, הימורים: No לכל השאלות
- משתמשים מתקשרים ביניהם או משתפים תוכן: No
- משתפת מיקום עם משתמשים אחרים: No
- רכישות דיגיטליות: No
- צפוי: Everyone / PEGI 3

## 5. Data safety
- Does your app collect or share any of the required user data types? Yes
- Is all data encrypted in transit? Yes (HTTPS בלבד)
- Account creation: My app does not allow users to create an account
- Data deletion: אפשר לבקש מחיקה במייל, וכיבוי התראות מוחק את הנתונים מהשרת

נתונים שנאספים (Collected, לא Shared):

| סוג | Collected | Shared | Ephemeral | Required/Optional | Purpose |
| --- | --- | --- | --- | --- | --- |
| Location > Precise location | Yes | No | No | Optional | App functionality |
| Location > Approximate location | No | | | | |
| Device or other IDs | Yes (כתובת Push) | No | No | Optional | App functionality |

מיקום מעוגל לכקילומטר עדיין נחשב Precise לפי גוגל (פחות מ-3 קמ"ר). Optional כי אפשר להשתמש באפליקציה עם עיר שנבחרה ידנית. Data deletion: מחיקה במייל, וכיבוי התראות מוחק מהשרת.

לא נאספים: שם, מייל, טלפון, אנשי קשר, תמונות, היסטוריית גלישה, נתוני שימוש או אנליטיקס, מזהי פרסום.

## 6. מסלול בדיקה סגורה (Testing > Closed testing)
1. Create track (או להשתמש ב-Alpha שכבר קיים)
2. Testers: Email list חדש, להדביק את כתובות ה-Gmail מהטבלה
3. Feedback URL or email: angel.elaad@gmail.com
4. Countries: All countries (או לפחות ישראל ומדינות של הבודקים)
5. Create release: להעלות את קובץ ה-AAB מ-GitHub Actions (artifact בשם multimodel-android)
6. Play App Signing: לאשר (Google מנהלת את מפתח החתימה, אנחנו נשארים עם מפתח ההעלאה)
7. Release notes: "First closed test of Tahazit."
8. Review and roll out, ולחכות לאישור גוגל לפני שליחת הקישור לבודקים
9. אחרי האישור: להעתיק את קישור ההצטרפות (Join on web / Join on Android) ולשלוח לבודקים

## 7. אחרי ההעלאה הראשונה
- Setup > App signing: להעתיק את SHA-256 של App signing key ולשלוח ל-Claude כדי להוסיף ל-assetlinks.json. בלי זה תופיע שורת כתובת באפליקציה שמותקנת מפליי
- בכל העלאה חדשה: להעלות versionCode

## 8. הגשה לפרסום (אחרי 14 ימים עם 12 בודקים לפחות)
Dashboard > Apply for production. גוגל שואלת על הבדיקה. כדאי לענות בפירוט:
- איך גויסו הבודקים (חברים, משפחה, קולגות)
- מה הם בדקו ואיזה פידבק נתנו (מעמודת "פידבק" בטבלה)
- מה תוקן בעקבות הבדיקה (גרסאות שעלו במהלך התקופה)
- למה האפליקציה מוכנה: יציבה, בלי קריסות, התראות עובדות
