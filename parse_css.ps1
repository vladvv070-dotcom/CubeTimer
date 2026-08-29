using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System.Web.Script.Serialization;

public class CSSParser {
    public static void Parse() {
        string path = @"d:\ВЛАД\CubeTimer\styles.css";
        string[] allLines = File.ReadAllLines(path);
        
        List<string> beforeLines = new List<string>();
        List<string> afterLines = new List<string>();
        string bgText = "";
        
        for(int i=0; i<4407; i++) beforeLines.Add(allLines[i]);
        for(int i=4407; i<=7124; i++) bgText += allLines[i] + "\n";
        for(int i=7125; i<allLines.Length; i++) afterLines.Add(allLines[i]);
        
        var themes = new Dictionary<string, Dictionary<string, string>>();
        
        var regex = new Regex(@"(?s)([^{]+)\{([^}]+)\}");
        foreach (Match m in regex.Matches(bgText)) {
            string selector = m.Groups[1].Value.Trim();
            string rules = m.Groups[2].Value.Trim();
            
            var bgMatch = Regex.Match(selector, @"\[data-bg=""([^""]+)""\]");
            if (!bgMatch.Success) continue;
            
            string bgId = bgMatch.Groups[1].Value;
            if (!themes.ContainsKey(bgId)) themes[bgId] = new Dictionary<string, string>();
            
            if (selector.EndsWith("::before")) {
                themes[bgId]["before"] = rules;
            } else if (selector.EndsWith("::after")) {
                themes[bgId]["after"] = rules;
            } else if (selector.Contains(".bg-btn")) {
                themes[bgId]["btn"] = rules;
            } else if (selector.EndsWith("]")) {
                themes[bgId]["main"] = rules;
            } else {
                if (!themes[bgId].ContainsKey("custom")) themes[bgId]["custom"] = "";
                string customSelector = Regex.Replace(selector, @"body(?:\.light-theme)?\[data-bg=""[^""]+""\]\s*", "");
                themes[bgId]["custom"] += customSelector + " { " + rules + " }\n";
            }
        }
        
        var jsSerializer = new JavaScriptSerializer();
        jsSerializer.MaxJsonLength = Int32.MaxValue;
        string json = jsSerializer.Serialize(themes);
        
        string jsContent = "window.BACKGROUNDS_DATA = " + json + ";";
        File.WriteAllText(@"d:\ВЛАД\CubeTimer\backgrounds-data.js", jsContent);
        
        beforeLines.AddRange(afterLines);
        File.WriteAllLines(@"d:\ВЛАД\CubeTimer\styles.css", beforeLines.ToArray());
    }
}
