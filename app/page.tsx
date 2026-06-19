"use client";

import { useMemo, useState } from "react";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const parseNumber = (value: string) => {
  const extracted = value.replace(/[^0-9]/g, "");
  const parsed = parseInt(extracted, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const extractFirstMatch = (text: string, regex: RegExp) => {
  const match = text.match(regex);
  return match ? match[1].trim() : "";
};

const parseJobPostText = (text: string) => {
  const normalized = text.replace(/\r/g, "\n").replace(/\n{2,}/g, "\n");
  const singleLine = normalized.replace(/\n/g, " ");
  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);

  const findCompanyNameFromLines = () => {
    const explicitPattern = /^(?:会社名|企業名|社名)[:：]?\s*(.+)$/;
    const companyTypePattern = /^(?:株式会社|有限会社|合同会社).+|.+(?:株式会社|有限会社|合同会社)$/;
    for (const line of lines) {
      const explicitMatch = line.match(explicitPattern);
      if (explicitMatch) return explicitMatch[1].trim();
    }
    for (const line of lines.slice(0, 8)) {
      if (companyTypePattern.test(line)) return line;
    }
    return "";
  };

  const companyName = findCompanyNameFromLines() || extractFirstMatch(normalized, /会社名[:：]?\s*([^\n]+)/) || extractFirstMatch(singleLine, /(?:社名|企業名)[:：]?\s*([^\n]+)/);
  const jobTitle = extractFirstMatch(normalized, /職種[:：]?\s*([^\n]+)/) || extractFirstMatch(singleLine, /(?:職種|仕事内容)[:：]?\s*([^\n]+)/);

  const salaryText = extractFirstMatch(singleLine, /月給[:：]?\s*([0-9,]+(?:万円|円)?)/);
  let salary = "";
  if (salaryText) {
    const yenMatch = salaryText.match(/([0-9,]+)円/);
    const manMatch = salaryText.match(/([0-9]+(?:\.[0-9]+)?)万円/);
    if (yenMatch) salary = yenMatch[1].replace(/,/g, "");
    else if (manMatch) salary = String(Math.round(parseFloat(manMatch[1]) * 10000));
    else salary = salaryText.replace(/[^0-9]/g, "");
  }

  const annualIncomeText = extractFirstMatch(singleLine, /年収[:：]?\s*([0-9,]+(?:万円|円)?)/);
  let annualIncome = "";
  if (annualIncomeText) {
    const yenMatch = annualIncomeText.match(/([0-9,]+)円/);
    const manMatch = annualIncomeText.match(/([0-9]+(?:\.[0-9]+)?)万円/);
    if (yenMatch) annualIncome = yenMatch[1].replace(/,/g, "");
    else if (manMatch) annualIncome = String(Math.round(parseFloat(manMatch[1]) * 10000));
    else annualIncome = annualIncomeText.replace(/[^0-9]/g, "");
  }

  const annualHolidays = extractFirstMatch(singleLine, /(?:年間休日|休日)[:：]?\s*([0-9]{2,3})/);
  const findOvertime = () => {
    const overtimePatterns = [
      /(?:残業(?:時間)?|月平均残業(?:時間)?|平均残業時間|時間外労働|時間外勤務)[:：]?\s*(?:月平均|平均|月)?\s*([0-9]{1,3})(?:\s*(?:〜|-|～)\s*([0-9]{1,3}))?\s*時間/, 
      /(?:残業(?:時間)?|月平均残業(?:時間)?|平均残業時間|時間外労働|時間外勤務)[^0-9\n]*([0-9]{1,3})\s*(?:〜|-|～)\s*([0-9]{1,3})\s*時間/, 
    ];

    for (const line of [singleLine, ...lines]) {
      for (const regex of overtimePatterns) {
        const match = line.match(regex);
        if (match) {
          const start = parseInt(match[1], 10);
          const end = match[2] ? parseInt(match[2], 10) : undefined;
          if (!Number.isNaN(start)) {
            return end && !Number.isNaN(end) ? String(Math.max(start, end)) : String(start);
          }
        }
      }
    }
    return "";
  };

  const overtime = findOvertime();
  const location = extractFirstMatch(normalized, /勤務地[:：]?\s*([^\n]+)/) || extractFirstMatch(singleLine, /住所[:：]?\s*([^\n]+)/);
  const commute = extractFirstMatch(singleLine, /通勤時間[:：]?\s*([0-9]{1,3}分)/);

  const nightShift = /夜勤|深夜|二交代|三交代|交替勤務|交代制/.test(singleLine);
  const fixedOvertime =
  /(固定残業代|みなし残業)[^。\n]{0,20}(あり|有|含む|込み|支給)/.test(singleLine) &&
  !/(固定残業代|みなし残業)[^。\n]{0,20}(なし|無し|無|含まない)/.test(singleLine);

  const jobMemo = extractFirstMatch(normalized, /仕事内容[:：]?\s*([^\n]+)/) || extractFirstMatch(normalized, /業務内容[:：]?\s*([^\n]+)/) || "";
  const concerns = extractFirstMatch(normalized, /気になる点[:：]?\s*([^\n]+)/) || extractFirstMatch(normalized, /不安|懸念[:：]?\s*([^\n]+)/) || "";

  return {
    companyName,
    jobTitle,
    salary,
    annualIncome,
    annualHolidays,
    overtime,
    location,
    commute,
    nightShift,
    fixedOvertime,
    jobMemo,
    concerns,
  };
};

/*
  評価基準（コード上での根拠メモ）

  1) 年間休日 (annualHolidays)
    - 120日以上: かなり良い
    - 112日以上: 平均以上の目安（厚生労働省の就労条件総合調査の企業平均が112日前後のため）
    - 105〜111日: やや少なめ
    - 104日以下: 注意

  2) 残業時間 (overtimeHours: 月あたり)
    - 0〜10時間: 少なめ
    - 11〜20時間: 普通〜やや注意
    - 21〜30時間: 家庭時間・体力面で注意
    - 31〜44時間: かなり注意
    - 45時間以上: 法定上限の原則（月45時間）に近く、強い確認推奨
    根拠: 厚生労働省の時間外労働上限（月45時間・年360時間）

  3) 通勤時間 (commuteMinutes)
    - 0〜30分: 負担少なめ
    - 31〜60分: やや負担
    - 61分以上: 毎日の生活負担として注意
    根拠: アプリ独自基準（生活時間・家族時間・疲労への影響を考慮）

  4) 夜勤/交代勤務
    - 夜勤ありは即NGではないが、生活リズムと家族時間への影響を確認することを推奨

  5) 固定残業代
    - 固定残業の時間数や超過支給の有無を面接で確認することを推奨

  これらの基準はコード内で参照され、診断文言は断定的にならない表現に揃えています。
*/


export default function Home() {
  const [formData, setFormData] = useState({
    companyName: "",
    jobTitle: "",
    industry: "製造業",
    priority: "年収",
    ageGroup: "20代",
    familyTimeImportance: "普通",
    physicalAnxiety: "普通",
    nightShiftTolerance: "普通",
    commuteTolerance: "普通",
    stressTolerance: "普通",
    salary: "",
    annualIncome: "",
    annualHolidays: "",
    overtime: "",
    location: "",
    commute: "",
    nightShift: false,
    fixedOvertime: false,
    jobMemo: "",
    concerns: "",
    interviewIssue: "",
    personalityMemo: "",
    pastMismatch: "",
    avoidConditions: "",
    gutMemo: "",
    jobPostText: "",
  });

  const industryOptions = [
    "製造業",
    "食品工場",
    "介護",
    "飲食",
    "物流・運送",
    "建設",
    "IT・事務",
    "営業",
    "農業・畜産",
    "小売",
    "その他",
  ];

  const priorityOptions = [
    "年収",
    "家族時間",
    "休日",
    "通勤の短さ",
    "安定性",
    "成長機会",
    "体力的負担の少なさ",
  ];

  const ageGroupOptions = ["20代", "30代", "40代", "50代以上"];
  const importanceOptions = ["とても高い", "高い", "普通", "低い", "とても低い"];
  const toleranceOptions = ["高い", "普通", "低い"];

  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleAutoFillFromText = () => {
    const parsed = parseJobPostText(formData.jobPostText);
    setFormData((prev) => ({
      ...prev,
      ...parsed,
    }));
  };

  const annualHolidays = useMemo(() => parseNumber(formData.annualHolidays), [formData.annualHolidays]);
  const overtimeHours = useMemo(() => parseNumber(formData.overtime), [formData.overtime]);
  const commuteMinutes = useMemo(() => parseNumber(formData.commute), [formData.commute]);
  const commuteScore = useMemo(() => clamp(Math.floor(commuteMinutes / 2), 0, 50), [commuteMinutes]);

  const holidaysLevel = useMemo(() => {
    if (annualHolidays >= 120) return { label: "かなり良い", reason: "年間休日が120日以上で十分な休息が期待できます。" };
    if (annualHolidays >= 112) return { label: "平均以上", reason: "年間休日が112日以上で、厚生労働省の平均に近い水準です。" };
    if (annualHolidays >= 105) return { label: "やや少なめ", reason: "年間休日が105〜111日でやや少なめです。面接で実態確認をおすすめします。" };
    return { label: "要注意", reason: "年間休日が104日以下です。休日の実態を確認してください。" };
  }, [annualHolidays]);

  const overtimeLevel = useMemo(() => {
    const h = overtimeHours;
    if (h <= 10) return { label: "少なめ", reason: "残業が月0〜10hで家庭時間や体力への影響は比較的小さいと考えられます。" };
    if (h <= 20) return { label: "普通〜やや注意", reason: "残業が月11〜20h程度。負担の感じ方は個人差があるため確認が有用です。" };
    if (h <= 30) return { label: "要注意", reason: "残業が月21〜30hで家庭時間や体力面で影響が出やすい水準です。" };
    if (h <= 44) return { label: "かなり注意", reason: "残業が月31〜44hで生活バランスに影響が出る可能性が高まります。" };
    return { label: "上限近い", reason: "残業が月45h以上で、法定上限に近い水準です。詳細確認を強く推奨します。" };
  }, [overtimeHours]);

  const commuteLevel = useMemo(() => {
    const m = commuteMinutes;
    if (m <= 30) return { label: "負担少なめ", reason: "通勤が30分以内で日々の負担は小さいと考えられます。" };
    if (m <= 60) return { label: "やや負担", reason: "通勤が31〜60分でやや負担となり得ます。" };
    return { label: "要注意", reason: "通勤が61分以上で毎日の生活負担として注意が必要です。" };
  }, [commuteMinutes]);

  const familyTimeScore = useMemo(() => {
    const base = 80;
    const holidayBonus = (annualHolidays - 110) * 0.6;
    const overtimePenalty = overtimeHours * 0.8;
    const commutePenalty = commuteMinutes * 0.35;
    const nightShiftPenalty = formData.nightShift ? 16 : 0;
    return clamp(Math.round(base + holidayBonus - overtimePenalty - commutePenalty - nightShiftPenalty), 0, 100);
  }, [annualHolidays, overtimeHours, commuteMinutes, formData.nightShift]);

  const lifestyleRisk = useMemo(() => {
    const nightShiftRisk = formData.nightShift ? 22 : 0;
    const overtimeRisk = overtimeHours * 1.2;
    const commuteRisk = commuteMinutes * 0.4;
    const holidayRisk = Math.max(0, 112 - annualHolidays) * 0.9;
    const fixedOvertimeRisk = formData.fixedOvertime ? 18 : 0;
    return clamp(Math.round(nightShiftRisk + overtimeRisk + commuteRisk + holidayRisk + fixedOvertimeRisk), 0, 100);
  }, [annualHolidays, overtimeHours, commuteMinutes, formData.nightShift, formData.fixedOvertime]);

  const blackSmellPoint = useMemo(() => {
    const fixedOvertimePoint = formData.fixedOvertime ? 18 : 0;
    const holidayPoint = Math.max(0, 115 - annualHolidays) * 0.8;
    const overtimePoint = overtimeHours * 1.1;
    const interviewPoint = formData.interviewIssue.trim().length > 0 ? 16 : 0;
    const vagueJobPoint = formData.jobMemo.trim().length < 20 ? 12 : 0;
    return clamp(Math.round(fixedOvertimePoint + holidayPoint + overtimePoint + interviewPoint + vagueJobPoint), 0, 100);
  }, [annualHolidays, overtimeHours, formData.fixedOvertime, formData.interviewIssue, formData.jobMemo]);

  const industryAdvice = useMemo(() => {
    switch (formData.industry) {
      case "製造業":
        return "製造業では夜勤がある求人も多いため、交代サイクルと休息時間の確保を必ず確認してください。";
      case "IT・事務":
        return "事務系で夜勤がある場合は特殊事例です。仕事内容と勤務形態を詳しく確認しましょう。";
      case "介護":
        return "介護業界では夜勤や交代勤務が多いため、しっかりシフトの実態を確認してください。";
      case "飲食":
      case "物流・運送":
      case "建設":
      case "小売":
      case "食品工場":
      case "農業・畜産":
        return "業界特性として負担やシフトが発生しやすいので、休日や休憩の取りやすさも確認しましょう。";
      default:
        return "この業界では、求人条件の背景を面接や会社説明でしっかり確認することが重要です。";
    }
  }, [formData.industry]);

  const priorityAdvice = useMemo(() => {
    switch (formData.priority) {
      case "年収":
        return "年収重視の場合は、残業や夜勤の負担と収入のバランスを確認してください。";
      case "家族時間":
        return "家族時間重視なら、残業・通勤・夜勤が生活時間をどれだけ圧迫するかを重視しましょう。";
      case "休日":
        return "休日重視であれば、法定休日と実際の取得状況を面接で確認することが大切です。";
      case "通勤の短さ":
        return "通勤時間は毎日の疲労につながるため、実際の通勤経路を意識して評価しましょう。";
      case "安定性":
        return "安定性を重視するなら、契約形態や業績、離職率を合わせて確認するのがおすすめです。";
      case "成長機会":
        return "成長機会を重視するなら、教育制度や評価基準、キャリアパスを確認してください。";
      case "体力的負担の少なさ":
        return "体力的負担が気になる場合は、残業・夜勤・業務内容の実働量を重視しましょう。";
      default:
        return "ご自身の重視点に沿って、求人の強みとリスクを比較してください。";
    }
  }, [formData.priority]);

  const questionSuggestions = useMemo(() => {
    const questions: string[] = [];
    if (formData.nightShift) {
      questions.push("夜勤のサイクルと休息日はどのように設定されていますか？");
    }
    if (formData.fixedOvertime) {
      questions.push("固定残業代の範囲と超過分の扱いを確認しましたか？");
    }
    if (priorityAdvice.includes("家族時間")) {
      questions.push("週末や夕方の家族時間は確保できそうですか？");
    }
    if (formData.interviewIssue.trim().length > 0) {
      questions.push("面接での違和感について具体的に確認できましたか？");
    }
    if (formData.jobMemo.trim().length < 20) {
      questions.push("仕事内容が曖昧な部分はありませんか？");
    }
    if (questions.length === 0) {
      questions.push("業界特性や重視点に合わせて、確認事項を整理しましょう。");
    }
    return questions;
  }, [formData.nightShift, formData.fixedOvertime, formData.interviewIssue, formData.jobMemo, priorityAdvice]);

  const selfMatchScore = useMemo(() => {
    let score = 75;
    if (formData.priority === "家族時間") score -= Math.max(0, 70 - familyTimeScore) * 0.4;
    if (formData.priority === "休日") score -= Math.max(0, 110 - annualHolidays) * 0.25;
    if (formData.priority === "通勤の短さ") score -= Math.max(0, commuteMinutes - 30) * 0.35;
    if (formData.priority === "体力的負担の少なさ") score -= Math.max(0, overtimeHours - 20) * 0.5;
    if (formData.priority === "年収" && parseNumber(formData.annualIncome) < 400) score -= 10;
    if (formData.nightShift && formData.nightShiftTolerance === "低い") score -= 20;
    if (!formData.nightShift && formData.nightShiftTolerance === "低い") score += 6;
    if (formData.commuteTolerance === "低い" && commuteMinutes > 40) score -= 12;
    if (formData.physicalAnxiety === "高い") score -= 14;
    if (formData.stressTolerance === "低い") score -= 8;
    if (formData.avoidConditions.trim().length > 0) score -= 8;
    return clamp(Math.round(score), 0, 100);
  }, [familyTimeScore, annualHolidays, commuteMinutes, overtimeHours, formData.priority, formData.nightShift, formData.nightShiftTolerance, formData.commuteTolerance, formData.physicalAnxiety, formData.stressTolerance, formData.avoidConditions, formData.annualIncome]);

  const physicalRisk = useMemo(() => {
    let risk = overtimeHours * 1.1 + (formData.nightShift ? 14 : 0);
    if (formData.physicalAnxiety === "高い") risk += 18;
    if (formData.physicalAnxiety === "普通") risk += 8;
    if (formData.nightShift && formData.nightShiftTolerance === "低い") risk += 14;
    if (formData.physicalAnxiety === "低い") risk -= 4;
    return clamp(Math.round(risk), 0, 100);
  }, [overtimeHours, formData.nightShift, formData.physicalAnxiety, formData.nightShiftTolerance]);

  const homeImpactRisk = useMemo(() => {
    let risk = (100 - familyTimeScore) * 0.5 + Math.max(0, 110 - annualHolidays) * 0.5 + commuteMinutes * 0.2;
    if (formData.familyTimeImportance === "とても高い") risk += 10;
    if (formData.familyTimeImportance === "高い") risk += 6;
    if (formData.commuteTolerance === "低い") risk += commuteMinutes > 30 ? 8 : 3;
    return clamp(Math.round(risk), 0, 100);
  }, [familyTimeScore, annualHolidays, commuteMinutes, formData.familyTimeImportance, formData.commuteTolerance]);

  const valueMismatch = useMemo(() => {
    let mismatch = 0;
    if (formData.priority === "年収") mismatch += parseNumber(formData.annualIncome) < 400 ? 12 : 0;
    if (formData.priority === "家族時間") mismatch += Math.max(0, 70 - familyTimeScore) * 0.3;
    if (formData.priority === "休日") mismatch += Math.max(0, 110 - annualHolidays) * 0.25;
    if (formData.priority === "通勤の短さ") mismatch += Math.max(0, commuteMinutes - 30) * 0.35;
    if (formData.priority === "体力的負担の少なさ") mismatch += overtimeHours * 0.4;
    if (formData.avoidConditions.trim().length > 0) mismatch += 10;
    if (formData.pastMismatch.trim().length > 0) mismatch += 6;
    return clamp(Math.round(mismatch), 0, 100);
  }, [formData.priority, formData.annualIncome, familyTimeScore, annualHolidays, commuteMinutes, overtimeHours, formData.avoidConditions, formData.pastMismatch]);

  const personalCheckPoints = useMemo(() => {
    const points: string[] = [];
    if (formData.nightShift && formData.nightShiftTolerance === "低い") {
      points.push("夜勤耐性が低い場合は、夜勤頻度と交代制の詳細を確認してください。");
    }
    if (formData.commuteTolerance === "低い" && commuteMinutes > 40) {
      points.push("通勤時間が長い場合、実際の通勤負担を具体的に検討しましょう。");
    }
    if (formData.physicalAnxiety === "高い" && overtimeHours > 20) {
      points.push("体力面に不安があるなら、残業実態と休息時間の確保を確認してください。");
    }
    if (formData.stressTolerance === "低い" && formData.interviewIssue.trim().length > 0) {
      points.push("ストレス耐性が低い場合に感じた違和感を無視せずに確認しましょう。");
    }
    if (formData.pastMismatch.trim().length > 0) {
      points.push("過去に合わなかった働き方の条件が今回の求人と重ならないか確認してください。");
    }
    if (formData.avoidConditions.trim().length > 0) {
      points.push("避けたい条件が求人に含まれていないか、面接でしっかり確認しましょう。");
    }
    if (!points.length) {
      points.push("自己理解を深めるために、求人の条件と自分の重視点を整理してみましょう。");
    }
    return points;
  }, [formData.nightShift, formData.nightShiftTolerance, formData.commuteTolerance, commuteMinutes, formData.physicalAnxiety, overtimeHours, formData.stressTolerance, formData.interviewIssue, formData.pastMismatch, formData.avoidConditions]);

  const overallScore = useMemo(() => {
    const score = familyTimeScore * 0.45 + (100 - lifestyleRisk) * 0.3 + (100 - blackSmellPoint) * 0.25;
    return clamp(Math.round(score), 0, 100);
  }, [familyTimeScore, lifestyleRisk, blackSmellPoint]);

  const evaluationLabel = useMemo(() => {
    if (overallScore >= 76 && lifestyleRisk < 50 && blackSmellPoint < 55) return "応募してよさそう";
    if (overallScore >= 60) return "要確認";
    if (overallScore >= 45) return "慎重に検討";
    return "危険かも";
  }, [overallScore, lifestyleRisk, blackSmellPoint]);

  const judgmentComment = useMemo(() => {
    if (evaluationLabel === "応募してよさそう") {
      return "応募を検討してもよさそうです。ただし面接で労働時間や固定残業の実態は確認した方がよさそうです。";
    }
    if (evaluationLabel === "要確認") {
      return "要確認です。残業や休日の実態を面接で確認することをおすすめします。";
    }
    if (evaluationLabel === "慎重に検討") {
      return "検討材料になります。休日・残業・夜勤などの点を優先的に確認してください。";
    }
    return "注意材料になります。求人内容の裏付けと面接での確認を強くおすすめします。";
  }, [evaluationLabel]);

  const summaryComment = useMemo(() => {
    const lines: string[] = [];
    lines.push(`この求人は ${formData.industry} の業界特性を踏まえると、検討材料として確認する価値があります。`);

    if (formData.priority === "家族時間") {
      lines.push("あなたが家族時間を重視している場合、残業時間・通勤時間・夜勤の有無は特に慎重に確認した方がよさそうです。");
    } else if (formData.priority === "年収") {
      lines.push("年収重視の立場では、残業や夜勤の負担と収入のバランスを面接で確認するのがよさそうです。");
    } else if (formData.priority === "休日") {
      lines.push("休日重視なら、年間休日の実態と休日出勤の有無をしっかり確認することが大切です。");
    } else if (formData.priority === "通勤の短さ") {
      lines.push("通勤時間を重視するなら、実際の通勤ルートとラッシュ時の所要時間も確認しましょう。");
    }

    // 評価基準に基づく簡易エビデンス（表示は簡潔に抑える）
    lines.push(`年間休日の判断: ${holidaysLevel.label} — ${holidaysLevel.reason}`);
    lines.push(`残業の判断: ${overtimeLevel.label} — ${overtimeLevel.reason}`);
    lines.push(`通勤の判断: ${commuteLevel.label} — ${commuteLevel.reason}`);

    if (formData.nightShift) {
      lines.push("夜勤ありの場合、交代サイクルや休息時間の確保についても確認した方がよいでしょう。");
      if (formData.nightShiftTolerance === "低い") {
        lines.push("特に夜勤への耐性が低いなら、実際の夜勤頻度や交代制の詳細を確認することが重要です。");
      }
    }

    if (formData.fixedOvertime) {
      lines.push("固定残業代ありは実務の実態と超過分の扱いを面接で確認する材料になります。");
    }

    if (formData.familyTimeImportance === "とても高い" || formData.familyTimeImportance === "高い") {
      lines.push("家族時間の重要度が高いなら、通勤時間や残業が家庭時間に与える影響を丁寧に検討してください。");
    }

    if (formData.physicalAnxiety === "高い" && overtimeHours > 20) {
      lines.push("体力面に不安がある場合、残業実態や休息時間の確保は特に重要な確認ポイントになります。");
    }

    if (formData.commuteTolerance === "低い" && commuteMinutes > 30) {
      lines.push("通勤耐性が低い場合は、通勤時間の長さが日々の負担になる可能性があります。" );
    }

    if (formData.stressTolerance === "低い" && formData.interviewIssue.trim().length > 0) {
      lines.push("ストレス耐性が低い場合は、面接で感じた違和感を軽視せずに確認するのがよさそうです。");
    }

    if (formData.personalityMemo.trim().length > 0) {
      lines.push("自己診断メモは求人との相性を考える上での参考になります。面接で自分の価値観を照らし合わせてみてください。");
    }

    if (formData.pastMismatch.trim().length > 0) {
      lines.push("過去に合わなかった働き方がある場合、今回の求人に同じ要素がないか意識して確認しましょう。");
    }

    if (formData.avoidConditions.trim().length > 0) {
      lines.push("絶対に避けたい条件があるなら、それらが含まれていないかを求人内容・面接で具体的に確認してください。");
    }

    if (lines.length === 1) {
      lines.push("最終的な判断はあなたご自身が行う前提で、参考情報として他求人とも比較してみてください。");
    } else {
      lines.push("最終判断はご自身が行う前提で、面接や求人情報の追加確認を行ってください。");
    }

    return lines.join(" ");
  }, [
    formData.industry,
    formData.priority,
    formData.nightShift,
    formData.nightShiftTolerance,
    formData.fixedOvertime,
    formData.familyTimeImportance,
    formData.physicalAnxiety,
    formData.interviewIssue,
    formData.personalityMemo,
    formData.pastMismatch,
    formData.avoidConditions,
    formData.priority,
    familyTimeScore,
    overtimeHours,
    commuteMinutes,
  ]);

  const clearForm = () => {
    setFormData({
      companyName: "",
      jobTitle: "",
      industry: "製造業",
      priority: "年収",
      ageGroup: "20代",
      familyTimeImportance: "普通",
      physicalAnxiety: "普通",
      nightShiftTolerance: "普通",
      commuteTolerance: "普通",
      stressTolerance: "普通",
      salary: "",
      annualIncome: "",
      annualHolidays: "",
      overtime: "",
      location: "",
      commute: "",
      nightShift: false,
      fixedOvertime: false,
      jobMemo: "",
      concerns: "",
      interviewIssue: "",
      personalityMemo: "",
      pastMismatch: "",
      avoidConditions: "",
      gutMemo: "",
      jobPostText: "",
    });
  };

  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");
  const [copyError, setCopyError] = useState("");
  const [compareList, setCompareList] = useState<any[]>([]);
const [compareMessage, setCompareMessage] = useState("");

  const generateResultText = () => {
    const lines: string[] = [];
    lines.push(`会社名: ${formData.companyName || "-"}`);
    lines.push(`職種: ${formData.jobTitle || "-"}`);
    lines.push(`業界: ${formData.industry || "-"}`);
    lines.push(`月給: ${formData.salary || "-"}`);
    lines.push(`想定年収: ${formData.annualIncome || "-"}`);
    lines.push(`年間休日: ${formData.annualHolidays || "-"}`);
    lines.push(`残業時間: ${formData.overtime || (overtimeHours ? `${overtimeHours}時間` : "-")}`);
    lines.push(`通勤時間: ${formData.commute || (commuteMinutes ? `${commuteMinutes}分` : "-")}`);
    lines.push(`夜勤の有無: ${formData.nightShift ? "有" : "無"}`);
    lines.push(`固定残業代の有無: ${formData.fixedOvertime ? "有" : "無"}`);
    lines.push(`総合スコア: ${overallScore}`);
    lines.push(`家族時間スコア: ${familyTimeScore}`);
    lines.push(`生活破壊リスク: ${lifestyleRisk}`);
    lines.push(`ブラック臭ポイント: ${blackSmellPoint}`);
    lines.push(`自分との相性スコア: ${selfMatchScore}`);
    lines.push(`体力負担リスク: ${physicalRisk}`);
    lines.push(`家庭影響リスク: ${homeImpactRisk}`);
    lines.push(`価値観とのズレ: ${valueMismatch}`);

    const goodPoints: string[] = [];
    const cautions: string[] = [];
    if (evaluationLabel === "応募してよさそう") goodPoints.push(judgmentComment);
    else cautions.push(judgmentComment);
    if (formData.jobMemo) goodPoints.push(`仕事内容: ${formData.jobMemo}`);
    if (formData.concerns) cautions.push(`懸念: ${formData.concerns}`);

    lines.push(`良いポイント:\n${goodPoints.length ? goodPoints.join("\n") : "-"}`);
    lines.push(`注意ポイント:\n${cautions.length ? cautions.join("\n") : "-"}`);

    lines.push("面接で確認すべき質問:");
    if (personalCheckPoints && personalCheckPoints.length) {
      personalCheckPoints.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
    } else {
      lines.push("-");
    }

    lines.push(`総合コメント:\n${summaryComment}`);
    return lines.join("\n");
  };

  const handleCopyResults = async () => {
    const text = generateResultText();
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("success");
      setCopyError("");
      setTimeout(() => setCopyStatus("idle"), 3000);
    } catch (e) {
      setCopyStatus("error");
      setCopyError("コピーできませんでした。手動で選択してください。");
      setTimeout(() => setCopyStatus("idle"), 5000);
    }
  };
  const handleAddToCompare = () => {
  setCompareMessage("");

  if (compareList.length >= 3) {
    setCompareMessage("比較できる求人は最大3件までです。");
    return;
  }

  const exists = compareList.some(
    (item) =>
      item.companyName === formData.companyName &&
      item.jobTitle === formData.jobTitle
  );

  if (exists) {
    setCompareMessage("この求人はすでに比較リストに追加されています。");
    return;
  }

  const newItem = {
    id: Date.now(),
    companyName: formData.companyName || "会社名未入力",
    jobTitle: formData.jobTitle || "職種未入力",
    industry: formData.industry,
    salary: formData.salary,
    annualIncome: formData.annualIncome,
    annualHolidays: formData.annualHolidays,
    overtime: formData.overtime,
    commute: formData.commute,
    nightShift: formData.nightShift,
    fixedOvertime: formData.fixedOvertime,
    overallScore,
    familyTimeScore,
    lifestyleRisk,
    blackSmellPoint,
    selfMatchScore,
    physicalRisk,
    homeImpactRisk,
    valueMismatch,
    evaluationLabel,
  };

  setCompareList([...compareList, newItem]);
  setCompareMessage("比較リストに追加しました。");
};

const handleRemoveFromCompare = (id: number) => {
  setCompareList(compareList.filter((item) => item.id !== id));
  setCompareMessage("比較リストから削除しました。");
};
const rankedCompareList = [...compareList].sort((a, b) => {
  const scoreA =
    a.overallScore * 0.5 +
    a.familyTimeScore * 0.25 +
    a.selfMatchScore * 0.25 -
    a.lifestyleRisk * 0.2 -
    a.blackSmellPoint * 0.2;

  const scoreB =
    b.overallScore * 0.5 +
    b.familyTimeScore * 0.25 +
    b.selfMatchScore * 0.25 -
    b.lifestyleRisk * 0.2 -
    b.blackSmellPoint * 0.2;

  return scoreB - scoreA;
});

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <h1 className="text-2xl font-bold">求人スコアチェッカー</h1>
          <p className="mt-1 text-sm text-slate-200">
            求人票の条件が生活・家族時間・体力・メンタルにどう影響するかを見える化。
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-slate-900">生活への影響を可視化する求人比較</h2>
          <p className="mt-2 text-slate-600">
            入力した条件から、家族時間、生活破壊リスク、ブラック臭ポイントがどう変わるかを確認できます。
          </p>
        </section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="md:col-span-2">
            <section className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-slate-900">求人入力フォーム</h3>
              <form className="mt-4 space-y-4">
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex flex-col gap-2 text-sm text-slate-700">
                    <span className="font-medium">求人票を貼り付ける</span>
                    <span className="text-slate-500">
                      求人サイトの仕事内容・給与・休日・勤務時間などをコピーして貼り付けると、自動入力できます。
                    </span>
                  </label>
                  <textarea
                    value={formData.jobPostText}
                    onChange={(event) => updateField("jobPostText", event.target.value)}
                    className="h-36 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800 shadow-sm focus:border-slate-400 focus:outline-none"
                    placeholder="ここに求人票のテキストを貼り付けてください。"
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-slate-500">
                      自動入力は求人票の表記によって誤認識する場合があります。送信・判断前に必ず内容を確認してください。
                    </p>
                    <button
                      type="button"
                      onClick={handleAutoFillFromText}
                      className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      求人票から自動入力
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">会社名</span>
                    <input
                      value={formData.companyName}
                      onChange={(event) => updateField("companyName", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 px-3 py-2"
                      placeholder="例: 株式会社サンプル"
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">職種</span>
                    <input
                      value={formData.jobTitle}
                      onChange={(event) => updateField("jobTitle", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 px-3 py-2"
                      placeholder="例: フロントエンドエンジニア"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">業界</span>
                    <select
                      value={formData.industry}
                      onChange={(event) => updateField("industry", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2"
                    >
                      {industryOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">重視すること</span>
                    <select
                      value={formData.priority}
                      onChange={(event) => updateField("priority", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2"
                    >
                      {priorityOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">月給</span>
                    <input
                      value={formData.salary}
                      onChange={(event) => updateField("salary", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 px-3 py-2"
                      placeholder="¥300,000"
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">想定年収</span>
                    <input
                      value={formData.annualIncome}
                      onChange={(event) => updateField("annualIncome", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 px-3 py-2"
                      placeholder="¥4,000,000"
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">年間休日</span>
                    <input
                      value={formData.annualHolidays}
                      onChange={(event) => updateField("annualHolidays", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 px-3 py-2"
                      placeholder="120"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">残業時間</span>
                    <input
                      value={formData.overtime}
                      onChange={(event) => updateField("overtime", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 px-3 py-2"
                      placeholder="月30時間"
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">勤務地</span>
                    <input
                      value={formData.location}
                      onChange={(event) => updateField("location", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 px-3 py-2"
                      placeholder="東京都 港区"
                    />
                  </label>
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">通勤時間</span>
                    <input
                      value={formData.commute}
                      onChange={(event) => updateField("commute", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 px-3 py-2"
                      placeholder="例: 40分"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.nightShift}
                      onChange={(event) => updateField("nightShift", event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-red-600"
                    />
                    <span className="text-sm text-slate-700">夜勤あり</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.fixedOvertime}
                      onChange={(event) => updateField("fixedOvertime", event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-red-600"
                    />
                    <span className="text-sm text-slate-700">固定残業代あり</span>
                  </label>
                </div>

                <label className="flex flex-col">
                  <span className="text-sm font-medium text-slate-700">仕事内容メモ</span>
                  <textarea
                    value={formData.jobMemo}
                    onChange={(event) => updateField("jobMemo", event.target.value)}
                    className="mt-1 h-24 rounded-md border border-slate-200 px-3 py-2 resize-none"
                    placeholder="業務内容や注意点をメモ"
                  />
                </label>

                <label className="flex flex-col">
                  <span className="text-sm font-medium text-slate-700">気になる点</span>
                  <textarea
                    value={formData.concerns}
                    onChange={(event) => updateField("concerns", event.target.value)}
                    className="mt-1 h-20 rounded-md border border-slate-200 px-3 py-2 resize-none"
                    placeholder="気になる働き方・条件"
                  />
                </label>

                <label className="flex flex-col">
                  <span className="text-sm font-medium text-slate-700">面接での違和感</span>
                  <textarea
                    value={formData.interviewIssue}
                    onChange={(event) => updateField("interviewIssue", event.target.value)}
                    className="mt-1 h-20 rounded-md border border-slate-200 px-3 py-2 resize-none"
                    placeholder="面接で感じた違和感を記載"
                  />
                </label>

                <label className="flex flex-col">
                  <span className="text-sm font-medium text-slate-700">自分の直感メモ</span>
                  <textarea
                    value={formData.gutMemo}
                    onChange={(event) => updateField("gutMemo", event.target.value)}
                    className="mt-1 h-20 rounded-md border border-slate-200 px-3 py-2 resize-none"
                    placeholder="直感的な印象や判断メモ"
                  />
                </label>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={clearForm}
                    className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
                  >
                    入力をクリア
                  </button>
                </div>
              </form>
            </section>

            <section className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-slate-900">自己条件フォーム</h3>
              <p className="mt-2 text-sm text-slate-600">
                あなた自身の年齢層や価値観、耐性を入力して、求人との相性を考える参考にできます。
              </p>
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">年齢層</span>
                    <select
                      value={formData.ageGroup}
                      onChange={(event) => updateField("ageGroup", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2"
                    >
                      {ageGroupOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">家族時間の重要度</span>
                    <select
                      value={formData.familyTimeImportance}
                      onChange={(event) => updateField("familyTimeImportance", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2"
                    >
                      {importanceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">体力への不安</span>
                    <select
                      value={formData.physicalAnxiety}
                      onChange={(event) => updateField("physicalAnxiety", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2"
                    >
                      {toleranceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">夜勤への耐性</span>
                    <select
                      value={formData.nightShiftTolerance}
                      onChange={(event) => updateField("nightShiftTolerance", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2"
                    >
                      {toleranceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">通勤への耐性</span>
                    <select
                      value={formData.commuteTolerance}
                      onChange={(event) => updateField("commuteTolerance", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2"
                    >
                      {toleranceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <label className="flex flex-col">
                    <span className="text-sm font-medium text-slate-700">ストレス耐性</span>
                    <select
                      value={formData.stressTolerance}
                      onChange={(event) => updateField("stressTolerance", event.target.value)}
                      className="mt-1 rounded-md border border-slate-200 bg-white px-3 py-2"
                    >
                      {toleranceOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="flex flex-col">
                  <span className="text-sm font-medium text-slate-700">MBTI・自己診断メモ</span>
                  <textarea
                    value={formData.personalityMemo}
                    onChange={(event) => updateField("personalityMemo", event.target.value)}
                    className="mt-1 h-24 rounded-md border border-slate-200 px-3 py-2 resize-none"
                    placeholder="性格や自己診断結果のメモ"
                  />
                </label>

                <label className="flex flex-col">
                  <span className="text-sm font-medium text-slate-700">過去に合わなかった働き方</span>
                  <textarea
                    value={formData.pastMismatch}
                    onChange={(event) => updateField("pastMismatch", event.target.value)}
                    className="mt-1 h-20 rounded-md border border-slate-200 px-3 py-2 resize-none"
                    placeholder="以前に合わなかった職種や働き方"
                  />
                </label>

                <label className="flex flex-col">
                  <span className="text-sm font-medium text-slate-700">絶対に避けたい条件</span>
                  <textarea
                    value={formData.avoidConditions}
                    onChange={(event) => updateField("avoidConditions", event.target.value)}
                    className="mt-1 h-20 rounded-md border border-slate-200 px-3 py-2 resize-none"
                    placeholder="避けたい勤務条件や職場の特徴"
                  />
                </label>
              </div>
            </section>
          </div>

          <aside className="md:col-span-1">
            <section className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between">
                <h3 className="text-lg font-medium text-slate-900">評価カード（プレビュー）</h3>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCopyResults}
                    className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-1 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    診断結果をコピー
                  </button>
                  
                  <button
  type="button"
  onClick={handleAddToCompare}
  className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-700"
>
  比較リストに追加
</button>
                  {copyStatus === "success" && (
                    <span className="text-sm text-emerald-600">コピーしました</span>
                  )}
                  {copyStatus === "error" && (
                    <span className="text-sm text-red-600">{copyError}</span>
                  )}
                  {compareMessage && (
  <span className="text-sm text-slate-600">{compareMessage}</span>
)}
                </div>
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">総合スコア</span>
                    <span className="text-sm font-semibold text-slate-900">{overallScore}</span>
                  </div>
                  <div className="mt-2 h-3 w-full rounded-full bg-slate-100">
                    <div className="h-3 rounded-full bg-red-500" style={{ width: `${overallScore}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">家族時間スコア</span>
                    <span className="text-sm font-semibold">{familyTimeScore}</span>
                  </div>
                  <div className="mt-2 h-3 w-full rounded-full bg-slate-100">
                    <div className="h-3 rounded-full bg-emerald-500" style={{ width: `${familyTimeScore}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">生活破壊リスク</span>
                    <span className="text-sm font-semibold text-red-700">{lifestyleRisk}</span>
                  </div>
                  <div className="mt-2 h-3 w-full rounded-full bg-slate-100">
                    <div className="h-3 rounded-full bg-red-600" style={{ width: `${lifestyleRisk}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">ブラック臭ポイント</span>
                    <span className="text-sm font-semibold text-red-700">{blackSmellPoint}</span>
                  </div>
                  <div className="mt-2 h-3 w-full rounded-full bg-slate-100">
                    <div className="h-3 rounded-full bg-red-600" style={{ width: `${blackSmellPoint}%` }} />
                  </div>
                </div>

                <div className="mt-3 border-t pt-3">
                  <span className="text-sm font-medium">応募判断</span>
                  <div className="mt-2">
                    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-800">
                      {evaluationLabel}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{judgmentComment}</p>
                </div>

                <div className="mt-3 border-t pt-3">
                  <span className="text-sm font-medium">総合コメント</span>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{summaryComment}</p>
                </div>

                <div className="mt-3 border-t pt-3">
                  <span className="text-sm font-medium">自分との相性スコア</span>
                  <div className="mt-2 flex items-center justify-between text-sm font-semibold text-slate-900">
                    <span>{selfMatchScore}</span>
                    <span className="text-slate-500">参考値</span>
                  </div>
                </div>

                <div className="mt-3 border-t pt-3">
                  <span className="text-sm font-medium">体力負担リスク</span>
                  <div className="mt-2 flex items-center justify-between text-sm font-semibold text-red-700">
                    <span>{physicalRisk}</span>
                    <span className="text-slate-500">高いほど要注意</span>
                  </div>
                </div>

                <div className="mt-3 border-t pt-3">
                  <span className="text-sm font-medium">家庭影響リスク</span>
                  <div className="mt-2 flex items-center justify-between text-sm font-semibold text-red-700">
                    <span>{homeImpactRisk}</span>
                    <span className="text-slate-500">低いほうが安心</span>
                  </div>
                </div>

                <div className="mt-3 border-t pt-3">
                  <span className="text-sm font-medium">価値観とのズレ</span>
                  <div className="mt-2 flex items-center justify-between text-sm font-semibold text-amber-700">
                    <span>{valueMismatch}</span>
                    <span className="text-slate-500">大きいほど注意</span>
                  </div>
                </div>

                <div className="mt-3 border-t pt-3">
                  <span className="text-sm font-medium">確認すべきポイント</span>
                  <ul className="mt-2 space-y-2 text-sm text-slate-600">
                    {personalCheckPoints.map((question) => (
                      <li key={question} className="list-disc pl-5">
                        {question}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 border-t pt-3">
                  <span className="text-sm font-medium">業界別アドバイス</span>
                  <p className="mt-2 text-sm text-slate-600">{industryAdvice}</p>
                </div>

                <div className="mt-3 border-t pt-3">
                  <span className="text-sm font-medium">重視点別アドバイス</span>
                  <p className="mt-2 text-sm text-slate-600">{priorityAdvice}</p>
                </div>
              </div>
            </section>
          </aside>
        </div>

        <section className="mt-8">
  <h3 className="text-lg font-semibold text-slate-900 mb-4">求人比較リスト</h3>

  {compareList.length === 0 ? (
    <div className="rounded-lg bg-white p-6 text-sm text-slate-600 shadow">
      まだ比較リストに求人が追加されていません。評価カードの「比較リストに追加」ボタンから追加できます。
    </div>
  ) : (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {rankedCompareList.map((item, index) => (
        <div key={item.id} className="min-w-[260px] flex-shrink-0 rounded-lg bg-white p-4 shadow">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="mb-2 inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
  おすすめ{index + 1}位
</span>
              <strong className="text-sm text-slate-900">{item.companyName}</strong>
              <p className="mt-1 text-xs text-slate-500">{item.jobTitle}</p>
            </div>
            <button
              type="button"
              onClick={() => handleRemoveFromCompare(item.id)}
              className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
            >
              削除
            </button>
          </div>

          <div className="mt-3 space-y-1 text-sm text-slate-700">
            <p>業界：{item.industry || "-"}</p>
            <p>月給：{item.salary || "-"}</p>
            <p>想定年収：{item.annualIncome || "-"}</p>
            <p>年間休日：{item.annualHolidays || "-"}</p>
            <p>残業：{item.overtime || "-"}</p>
            <p>通勤：{item.commute || "-"}</p>
            <p>夜勤：{item.nightShift ? "あり" : "なし"}</p>
            <p>固定残業代：{item.fixedOvertime ? "あり" : "なし"}</p>
          </div>

          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span>総合スコア</span>
              <strong>{item.overallScore}</strong>
            </div>
            <div className="mt-1 flex justify-between">
              <span>家族時間</span>
              <strong>{item.familyTimeScore}</strong>
            </div>
            <div className="mt-1 flex justify-between">
              <span>生活破壊リスク</span>
              <strong className="text-red-700">{item.lifestyleRisk}</strong>
            </div>
            <div className="mt-1 flex justify-between">
              <span>ブラック臭</span>
              <strong className="text-red-700">{item.blackSmellPoint}</strong>
            </div>
            <div className="mt-1 flex justify-between">
              <span>相性</span>
              <strong>{item.selfMatchScore}</strong>
            </div>
          </div>

          <div className="mt-4">
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-800">
              {item.evaluationLabel}
            </span>
          </div>
        </div>
      ))}
    </div>
  )}
</section>

        <footer className="mt-10 text-center text-sm text-slate-500">
          ※この画面は見た目のMVPです。保存やログイン機能は未実装です。
        </footer>
      </main>
    </div>
  );
}
