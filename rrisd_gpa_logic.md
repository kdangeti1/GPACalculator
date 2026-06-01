# Round Rock ISD (RRISD) GPA Calculation Engine

This document provides a comprehensive technical reference for the Grade Point Average (GPA) calculation logic used by the Round Rock Independent School District (RRISD). This logic was reverse-engineered from the **GradeWay for HAC** Android application, specifically extracted from the dynamic Dart AOT binary (`libapp.so`) class `RoundRockGpaSettingsConverter`.

---

## 1. The Core Concept: 100-Point Granularity

Unlike standard GPA systems that convert a letter grade range (e.g., 90–100) into a single point value (e.g., 4.0), Round Rock ISD utilizes a **granular 100-point system**. 

* **Every single numeric grade point has a unique GPA value.**
* Points drop by exactly **`0.1`** for every single numeric grade step down from 100 to 70.
* Any semester grade **below 70 is considered failing** and automatically yields **`0.0`** GPA points on both scales.

---

## 2. Unweighted GPA Scale (Standard 4.0 Scale)

Unweighted GPA is calculated by treating all courses equally, regardless of course rigor (AP, Honors, or Regular are not weighted differently). It uses a standard categorical step-function mapping:

| Grade Range | Letter Grade | Unweighted GPA Points |
| :---: | :---: | :---: |
| **90 – 100** | A | **4.0** |
| **80 – 89** | B | **3.0** |
| **70 – 79** | C | **2.0** |
| **Below 70** | F | **0.0** |

---

## 3. Weighted GPA Scale (Granular 6.0 / 5.0 / 4.0 Scale)

Weighted GPA calculations are split into three course difficulty tiers (Levels I, II, and III). Each level maps numeric grades between **70 and 100** to specific points using simple linear offset formulas:

### Level I: AP / IB / OnRamps / TAG Courses (Weighted 6.0 Scale)
Designed for college-level courses that carry the highest academic rigor.
* **Mathematical Formula:**
  $$\text{Points} = \frac{\text{Grade}}{10} - 4.0$$

#### Level I Scale Table
* `100%` = **6.0** points
* `99%` = **5.9** points
* `98%` = **5.8** points
* `90%` = **5.0** points
* `80%` = **4.0** points
* `70%` = **3.0** points
* `Below 70` = **0.0** points

---

### Level II: Pre-AP / Advanced / Honors / Dual Credit (Weighted 5.0 Scale)
Designed for advanced high school level courses.
* **Mathematical Formula:**
  $$\text{Points} = \frac{\text{Grade}}{10} - 5.0$$

#### Level II Scale Table
* `100%` = **5.0** points
* `99%` = **4.9** points
* `98%` = **4.8** points
* `90%` = **4.0** points
* `80%` = **3.0** points
* `70%` = **2.0** points
* `Below 70` = **0.0** points

---

### Level III: Regular / On-Level Courses (Weighted 4.0 Scale)
Designed for standard on-level courses.
* **Mathematical Formula:**
  $$\text{Points} = \frac{\text{Grade}}{10} - 6.0$$

#### Level III Scale Table
* `100%` = **4.0** points
* `99%` = **3.9** points
* `98%` = **3.8** points
* `90%` = **3.0** points
* `80%` = **2.0** points
* `70%` = **1.0** points
* `Below 70` = **0.0** points

---

## 4. Automatic Rigor Level Detection

To automate GPA calculation from scraped Home Access Center (HAC) transcripts, courses are categorized by scanning their descriptions for specific keywords.

### Level I (AP/IB/OnRamps/TAG) Matches:
* Preceded or followed by **`AP `**, **`IB `**, or **`ONRAMPS`**
* Starts with **`AP`** or **`IB`**
* *Examples:* `"AP ENGLISH 3"`, `"IBSPANSL"`, `"APCSHP"`

### Level II (Advanced/Pre-AP/Honors/Dual Credit) Matches:
* Contains **`HONORS`**, **`ADV`**, **`PREAP`**, **`PRE-AP`**, or **`DUAL CREDIT`**
* *Examples:* `"ADV GEOMETRY"`, `"CHEMISTRY PREAP"`

### Level III (Regular) Matches:
* Fallback category for any course not matching Level I or Level II criteria.

---

## 5. JavaScript / React Reference Implementation

Below is the verified JavaScript code implemented in the live application:

```javascript
/**
 * Calculates weighted and unweighted GPA points for a single course grade based on RRISD EIC policy.
 * @param {string} courseName - The name of the course (e.g., "AP BIOLOGY", "GEOMETRY")
 * @param {number} grade - The numerical grade (0 - 100)
 * @returns {object} { weightedPoints, unweightedPoints, level }
 */
export function calculateRRISDGpaPoints(courseName, grade) {
  // 1. Check for failing grades
  if (isNaN(grade) || grade < 69.5) {
    return { weightedPoints: 0.0, unweightedPoints: 0.0, level: 'Regular' };
  }

  const nameUpper = courseName.toUpperCase();
  let weightedPoints = 0.0;
  let level = 'Regular';

  // 2. Unweighted GPA Calculation
  let unweightedPoints = 0.0;
  if (grade >= 89.5) unweightedPoints = 4.0;
  else if (grade >= 79.5) unweightedPoints = 3.0;
  else if (grade >= 69.5) unweightedPoints = 2.0;

  // 3. Rigor Level Detection & Weighted GPA Calculation
  if (nameUpper.includes('AP ') || nameUpper.includes('IB ') || nameUpper.includes('ONRAMPS') || nameUpper.startsWith('AP') || nameUpper.startsWith('IB')) {
    level = 'AP/IB';
    weightedPoints = (grade / 10) - 4.0; // Level I
  } else if (nameUpper.includes('HONORS') || nameUpper.includes('ADV') || nameUpper.includes('PREAP') || nameUpper.includes('PRE-AP') || nameUpper.includes('DUAL CREDIT')) {
    level = 'Advanced';
    weightedPoints = (grade / 10) - 5.0; // Level II
  } else {
    level = 'Regular';
    weightedPoints = (grade / 10) - 6.0; // Level III
  }

  // Round values to 2 decimal places to address float precision issues
  return {
    weightedPoints: parseFloat(weightedPoints.toFixed(2)),
    unweightedPoints: parseFloat(unweightedPoints.toFixed(2)),
    level
  };
}
```
