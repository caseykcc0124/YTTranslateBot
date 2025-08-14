/**
 * 完整句子合併功能測試
 * 
 * 測試智能語義邊界檢測和句子合併邏輯
 */

// 模擬字幕條目
const testSubtitles = [
  // 測試案例1: 需要合併的不完整句子
  {
    start: 7.1,
    end: 14.23,
    text: "所以，你有兩支隊伍，日本隊有四名划槳手和一名舵手，而美國隊有四名舵手和一名划槳手，然後"
  },
  {
    start: 14.33,
    end: 20.7,
    text: "有人能猜到美國隊輸了的時候，他們會怎麼做？他們解僱了划槳手。"
  },
  
  // 測試案例2: 完整句子，不應該合併
  {
    start: 21.0,
    end: 25.0,
    text: "這是一個完整的句子。"
  },
  {
    start: 25.5,
    end: 30.0,
    text: "這也是另一個完整的句子。"
  },
  
  // 測試案例3: 標點符號連接
  {
    start: 31.0,
    end: 35.0,
    text: "首先我們需要準備材料，"
  },
  {
    start: 35.2,
    end: 40.0,
    text: "然後開始製作過程。"
  },
  
  // 測試案例4: 連接詞開頭
  {
    start: 41.0,
    end: 45.0,
    text: "市場上有很多選擇"
  },
  {
    start: 45.3,
    end: 50.0,
    text: "但是我們需要找到最適合的方案。"
  },
  
  // 測試案例5: 助動詞結尾
  {
    start: 51.0,
    end: 55.0,
    text: "如果你想要成功，你必須"
  },
  {
    start: 55.2,
    end: 60.0,
    text: "持續努力和學習。"
  }
];

// 模擬 PostTranslationStyleAdjuster 的關鍵方法
class MockStyleAdjuster {
  
  // 檢查是否為完整句子結尾
  isCompleteSentenceEnd(text) {
    const sentenceEndPatterns = [
      /[。！？]$/,           // 句號、驚嘆號、問號結尾
      /[。！？][\"」』]$/,     // 引號內的句子結尾
      /[\d]+[。]$/,          // 數字句號（如：1. 2.）
    ];

    return sentenceEndPatterns.some(pattern => pattern.test(text.trim()));
  }

  // 檢查是否為不完整句子（需要合併）
  isIncompleteSentence(text1, text2) {
    const incompletePhrasePatterns = [
      // text1以這些結尾，通常需要接續
      {
        pattern: /[，、；]$/,
        priority: 3
      },
      {
        pattern: /[的了過在於會將要能可]$/,
        priority: 4
      },
      {
        pattern: /[是為從被讓使]$/,
        priority: 4
      },
      // text2以這些開始，通常是前句的延續
      {
        pattern: /^[而且也還並且但是不過然而所以因此]/,
        priority: 3
      },
      {
        pattern: /^[這那這樣那樣此其]/,
        priority: 3
      },
      {
        pattern: /^[就才都只]/,
        priority: 2
      }
    ];

    // 檢查句子結構完整性
    const text1HasSubjectVerb = this.hasBasicSentenceStructure(text1);
    const text2HasSubjectVerb = this.hasBasicSentenceStructure(text2);
    const combinedText = text1 + text2;
    const combinedHasStructure = this.hasBasicSentenceStructure(combinedText);

    // 如果單獨都不完整，但合併後完整，則應該合併
    if (!text1HasSubjectVerb && !text2HasSubjectVerb && combinedHasStructure) {
      return true;
    }

    // 檢查模式匹配
    for (const { pattern, priority } of incompletePhrasePatterns) {
      if (pattern.test(text1) || pattern.test(text2)) {
        return true;
      }
    }

    return false;
  }

  // 檢查是否有基本句子結構（主語+謂語）
  hasBasicSentenceStructure(text) {
    // 簡化的句子結構檢查
    const hasVerb = /[是有在做說看來去會能可將要讓使被]/.test(text);
    const hasNounOrPronoun = /[我你他她它們人們大家什麼哪裡時候]/.test(text) || 
                            text.length > 3; // 較長文本通常包含主語
    
    return hasVerb && hasNounOrPronoun;
  }

  // 計算語義相關性評分
  calculateSemanticScore(text1, text2) {
    let score = 0.5; // 基礎分數
    
    // 檢查不完整句子模式
    if (this.isIncompleteSentence(text1, text2)) {
      score += 0.3;
    }

    // 檢查連接詞
    const connectiveWords = ['而且', '也', '還', '並且', '但是', '不過', '然而', '所以', '因此', '因為', '由於'];
    if (connectiveWords.some(word => text2.startsWith(word))) {
      score += 0.2;
    }

    // 檢查指示詞連接
    if (/^[這那此其]/.test(text2) && text1.length > 5) {
      score += 0.15;
    }

    // 檢查標點符號
    if (text1.endsWith('，') || text1.endsWith('、')) {
      score += 0.2;
    }

    // 檢查時態一致性
    if (this.hasSimilarTense(text1, text2)) {
      score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  // 檢查時態一致性
  hasSimilarTense(text1, text2) {
    const pastTensePattern = /[了過完]/;
    const futureTensePattern = /[會將要]/;
    const presentTensePattern = /[在著正]/;

    const text1Past = pastTensePattern.test(text1);
    const text1Future = futureTensePattern.test(text1);
    const text1Present = presentTensePattern.test(text1);
    
    const text2Past = pastTensePattern.test(text2);
    const text2Future = futureTensePattern.test(text2);
    const text2Present = presentTensePattern.test(text2);

    return (text1Past && text2Past) ||
           (text1Future && text2Future) ||
           (text1Present && text2Present);
  }

  // 計算句子完整性評分
  calculateSentenceCompleteness(text) {
    let score = 0;

    // 有完整句子標點
    if (this.isCompleteSentenceEnd(text)) {
      score += 0.4;
    }

    // 有基本句子結構
    if (this.hasBasicSentenceStructure(text)) {
      score += 0.3;
    }

    // 長度合理
    if (text.length >= 8 && text.length <= 50) {
      score += 0.2;
    }

    // 沒有明顯的不完整標誌
    if (!this.hasIncompleteMarkers(text)) {
      score += 0.1;
    }

    return score;
  }

  // 檢查不完整標誌
  hasIncompleteMarkers(text) {
    const incompleteMarkers = [
      /[，、；]$/,     // 以非句號標點結尾
      /[的了在]$/,     // 以助詞結尾
      /^[而且也]/,     // 以連接詞開始
      /[會將要]$/,     // 以助動詞結尾
    ];

    return incompleteMarkers.some(pattern => pattern.test(text));
  }
}

// 運行測試
function runTests() {
  const adjuster = new MockStyleAdjuster();
  
  console.log("🧪 開始完整句子合併功能測試");
  console.log("============================================================");
  
  // 測試1: 完整句子識別
  console.log("\n📋 測試1: 完整句子識別");
  const completeTests = [
    "這是一個完整的句子。",
    "你好嗎？",
    "太棒了！",
    "他說：「我很開心。」",
    "1. 第一步完成。"
  ];
  
  completeTests.forEach((text, i) => {
    const isComplete = adjuster.isCompleteSentenceEnd(text);
    console.log(`  ${i + 1}. "${text}" → ${isComplete ? '✅ 完整' : '❌ 不完整'}`);
  });

  // 測試2: 不完整句子檢測
  console.log("\n📋 測試2: 不完整句子檢測");
  const incompleteTests = [
    ["所以你有兩支隊伍，然後", "有人能猜到會怎麼做嗎？"],
    ["首先我們需要準備，", "然後開始執行計劃。"],
    ["市場上有很多選擇", "但是我們需要找到最適合的。"],
    ["如果你想要成功，你必須", "持續努力和學習。"],
    ["這是完整的句子。", "這也是完整的句子。"]
  ];
  
  incompleteTests.forEach(([text1, text2], i) => {
    const shouldMerge = adjuster.isIncompleteSentence(text1, text2);
    console.log(`  ${i + 1}. "${text1}" + "${text2}"`);
    console.log(`     → ${shouldMerge ? '✅ 需要合併' : '❌ 不需要合併'}`);
  });

  // 測試3: 語義評分
  console.log("\n📋 測試3: 語義相關性評分");
  incompleteTests.forEach(([text1, text2], i) => {
    const score = adjuster.calculateSemanticScore(text1, text2);
    const shouldMerge = score >= 0.3;
    console.log(`  ${i + 1}. "${text1}" + "${text2}"`);
    console.log(`     → 評分: ${score.toFixed(2)} ${shouldMerge ? '✅ 合併' : '❌ 不合併'}`);
  });

  // 測試4: 句子完整性評分
  console.log("\n📋 測試4: 句子完整性評分");
  const completenessTests = [
    "所以你有兩支隊伍，然後",
    "這是一個完整的句子。",
    "首先我們需要準備，",
    "市場上有很多選擇",
    "所以你有兩支隊伍，然後，有人能猜到會怎麼做嗎？"
  ];
  
  completenessTests.forEach((text, i) => {
    const score = adjuster.calculateSentenceCompleteness(text);
    console.log(`  ${i + 1}. "${text}"`);
    console.log(`     → 完整性評分: ${score.toFixed(2)} ${score > 0.7 ? '✅ 高完整性' : score > 0.4 ? '⚠️ 中等完整性' : '❌ 低完整性'}`);
  });

  // 測試5: 實際合併場景測試
  console.log("\n📋 測試5: 實際合併場景模擬");
  
  // 模擬原始範例
  const originalExample = {
    before: [
      {
        start: 7.1,
        end: 14.23,
        text: "所以，你有兩支隊伍，日本隊有四名划槳手和一名舵手，而美國隊有四名舵手和一名划槳手，然後"
      },
      {
        start: 14.33,
        end: 20.7,
        text: "有人能猜到美國隊輸了的時候，他們會怎麼做？他們解僱了划槳手。"
      }
    ]
  };

  const text1 = originalExample.before[0].text;
  const text2 = originalExample.before[1].text;
  
  console.log("  原始字幕:");
  console.log(`    1. [${originalExample.before[0].start}s-${originalExample.before[0].end}s] ${text1}`);
  console.log(`    2. [${originalExample.before[1].start}s-${originalExample.before[1].end}s] ${text2}`);
  
  const semanticScore = adjuster.calculateSemanticScore(text1, text2);
  const shouldMerge = adjuster.isIncompleteSentence(text1, text2);
  const completeness1 = adjuster.calculateSentenceCompleteness(text1);
  const completeness2 = adjuster.calculateSentenceCompleteness(text2);
  const combinedCompleteness = adjuster.calculateSentenceCompleteness(text1 + text2);
  
  console.log("\n  分析結果:");
  console.log(`    語義評分: ${semanticScore.toFixed(2)}`);
  console.log(`    需要合併: ${shouldMerge ? '✅ 是' : '❌ 否'}`);
  console.log(`    第一句完整性: ${completeness1.toFixed(2)}`);
  console.log(`    第二句完整性: ${completeness2.toFixed(2)}`);
  console.log(`    合併後完整性: ${combinedCompleteness.toFixed(2)}`);
  
  if (shouldMerge && semanticScore >= 0.3) {
    const mergedText = text1 + "，" + text2;
    console.log("\n  ✅ 建議合併結果:");
    console.log(`    [${originalExample.before[0].start}s-${originalExample.before[1].end}s] ${mergedText}`);
  } else {
    console.log("\n  ❌ 不建議合併，保持原狀");
  }

  console.log("\n🎉 測試完成！");
  console.log("============================================================");
}

// 執行測試
runTests();