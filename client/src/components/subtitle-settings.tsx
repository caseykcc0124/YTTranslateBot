import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export interface SubtitleSettings {
  fontSize: number;
  color: string;
  backgroundColor: string;
  opacity: number;
  position: 'top' | 'center' | 'bottom';
  fontWeight: 'normal' | 'bold';
  shadow: boolean;
  outline: boolean;
}

interface SubtitleSettingsProps {
  settings: SubtitleSettings;
  onChange: (settings: SubtitleSettings) => void;
  isVisible: boolean;
  onToggle: () => void;
}

const defaultSettings: SubtitleSettings = {
  fontSize: 20,
  color: '#ffffff',
  backgroundColor: 'transparent',
  opacity: 100,
  position: 'bottom',
  fontWeight: 'bold',
  shadow: true,
  outline: false,
};

const colorPresets = [
  { name: '白色', value: '#ffffff' },
  { name: '黃色', value: '#ffff00' },
  { name: '紅色', value: '#ff0000' },
  { name: '藍色', value: '#0066ff' },
  { name: '綠色', value: '#00ff00' },
  { name: '黑色', value: '#000000' },
];

const backgroundColorPresets = [
  { name: '透明', value: 'transparent' },
  { name: '黑色', value: '#000000' },
  { name: '灰色', value: '#666666' },
  { name: '白色', value: '#ffffff' },
];

export default function SubtitleSettings({ 
  settings, 
  onChange, 
  isVisible, 
  onToggle 
}: SubtitleSettingsProps) {
  const [localSettings, setLocalSettings] = useState<SubtitleSettings>(settings);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSettingChange = (key: keyof SubtitleSettings, value: any) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    onChange(newSettings);
  };

  const resetToDefaults = () => {
    setLocalSettings(defaultSettings);
    onChange(defaultSettings);
  };

  if (!isVisible) {
    return (
      <Button
        onClick={onToggle}
        variant="default"
        size="sm"
        className="fixed top-20 right-4 z-40 bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
      >
        <i className="fas fa-cog mr-2"></i>
        字幕外觀設定
      </Button>
    );
  }

  return (
    <div className="fixed top-16 right-4 z-40 w-80 max-h-[calc(100vh-5rem)]">
      <Card className="bg-white/95 backdrop-blur-sm shadow-2xl border border-gray-200 overflow-hidden">
        <CardHeader className="pb-2 sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-gray-900 flex items-center">
              <i className="fas fa-text-height mr-2 text-blue-600 text-sm"></i>
              字幕外觀設定
            </CardTitle>
            <Button
              onClick={onToggle}
              variant="destructive"
              size="sm"
              className="h-8 px-3 bg-red-500 hover:bg-red-600 text-white"
              title="關閉設定面板"
            >
              <i className="fas fa-times mr-1"></i>
              關閉
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-3 p-4 max-h-[calc(100vh-10rem)] overflow-y-auto">
          {/* 字體大小 */}
          <div>
            <Label className="text-xs font-medium text-gray-700 mb-1 block">
              字體大小: {localSettings.fontSize}px
            </Label>
            <Slider
              value={[localSettings.fontSize]}
              onValueChange={([value]) => handleSettingChange('fontSize', value)}
              min={12}
              max={48}
              step={2}
              className="w-full"
            />
          </div>

          {/* 字體粗細 */}
          <div>
            <Label className="text-xs font-medium text-gray-700 mb-1 block">
              字體粗細
            </Label>
            <RadioGroup
              value={localSettings.fontWeight}
              onValueChange={(value) => handleSettingChange('fontWeight', value)}
              className="flex space-x-3"
            >
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="normal" id="normal" className="h-3 w-3" />
                <Label htmlFor="normal" className="text-xs cursor-pointer">正常</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="bold" id="bold" className="h-3 w-3" />
                <Label htmlFor="bold" className="text-xs cursor-pointer">粗體</Label>
              </div>
            </RadioGroup>
          </div>

          {/* 字幕顏色 */}
          <div>
            <Label className="text-xs font-medium text-gray-700 mb-1 block">
              字幕顏色
            </Label>
            <div className="grid grid-cols-3 gap-1">
              {colorPresets.map((color) => (
                <button
                  key={color.value}
                  onClick={() => handleSettingChange('color', color.value)}
                  className={`w-full h-7 rounded border-2 transition-all text-xs ${
                    localSettings.color === color.value 
                      ? 'border-blue-500 ring-1 ring-blue-200' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  style={{ backgroundColor: color.value === 'transparent' ? '#f3f4f6' : color.value }}
                  title={color.name}
                >
                  {color.value === 'transparent' && (
                    <span className="text-gray-500">透明</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 背景顏色 */}
          <div>
            <Label className="text-xs font-medium text-gray-700 mb-1 block">
              背景顏色
            </Label>
            <div className="grid grid-cols-2 gap-1">
              {backgroundColorPresets.map((color) => (
                <button
                  key={color.value}
                  onClick={() => handleSettingChange('backgroundColor', color.value)}
                  className={`w-full h-7 rounded border-2 transition-all ${
                    localSettings.backgroundColor === color.value 
                      ? 'border-blue-500 ring-1 ring-blue-200' 
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                  style={{ 
                    backgroundColor: color.value === 'transparent' ? '#f3f4f6' : color.value,
                    backgroundImage: color.value === 'transparent' 
                      ? 'repeating-conic-gradient(#f3f4f6 0% 25%, transparent 0% 50%)' 
                      : undefined,
                    backgroundSize: color.value === 'transparent' ? '8px 8px' : undefined
                  }}
                  title={color.name}
                >
                  <span className={`text-xs ${color.value === '#000000' ? 'text-white' : 'text-gray-700'}`}>
                    {color.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 透明度 */}
          {localSettings.backgroundColor !== 'transparent' && (
            <div>
              <Label className="text-xs font-medium text-gray-700 mb-1 block">
                背景透明度: {localSettings.opacity}%
              </Label>
              <Slider
                value={[localSettings.opacity]}
                onValueChange={([value]) => handleSettingChange('opacity', value)}
                min={0}
                max={100}
                step={10}
                className="w-full"
              />
            </div>
          )}

          {/* 字幕位置 */}
          <div>
            <Label className="text-xs font-medium text-gray-700 mb-1 block">
              字幕位置
            </Label>
            <RadioGroup
              value={localSettings.position}
              onValueChange={(value) => handleSettingChange('position', value)}
              className="flex space-x-3"
            >
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="top" id="top" className="h-3 w-3" />
                <Label htmlFor="top" className="text-xs cursor-pointer">頂部</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="center" id="center" className="h-3 w-3" />
                <Label htmlFor="center" className="text-xs cursor-pointer">中間</Label>
              </div>
              <div className="flex items-center space-x-1">
                <RadioGroupItem value="bottom" id="bottom" className="h-3 w-3" />
                <Label htmlFor="bottom" className="text-xs cursor-pointer">底部</Label>
              </div>
            </RadioGroup>
          </div>

          {/* 文字效果 */}
          <div>
            <Label className="text-xs font-medium text-gray-700 mb-1 block">
              文字效果
            </Label>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.shadow}
                  onChange={(e) => handleSettingChange('shadow', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3 w-3"
                />
                <span className="text-xs">陰影</span>
              </label>
              <label className="flex items-center space-x-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localSettings.outline}
                  onChange={(e) => handleSettingChange('outline', e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-3 w-3"
                />
                <span className="text-xs">邊框</span>
              </label>
            </div>
          </div>

          {/* 預覽 */}
          <div className="border-t pt-3">
            <Label className="text-xs font-medium text-gray-700 mb-1 block">
              預覽效果
            </Label>
            <div className="relative bg-gray-900 rounded-lg h-14 flex items-center justify-center overflow-hidden">
              <div
                className="px-3 py-1 rounded transition-all leading-relaxed"
                style={{
                  fontSize: `${localSettings.fontSize * 0.8}px`,
                  color: localSettings.color,
                  backgroundColor: localSettings.backgroundColor === 'transparent' 
                    ? 'transparent' 
                    : `${localSettings.backgroundColor}${Math.round(localSettings.opacity * 2.55).toString(16).padStart(2, '0')}`,
                  fontWeight: localSettings.fontWeight,
                  textShadow: localSettings.shadow 
                    ? '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.6), 1px -1px 2px rgba(0,0,0,0.6), -1px 1px 2px rgba(0,0,0,0.6)' 
                    : 'none',
                  WebkitTextStroke: localSettings.outline ? '1px black' : 'none',
                  lineHeight: '1.2'
                }}
              >
                範例字幕 Sample
              </div>
            </div>
          </div>

          {/* 重設按鈕 */}
          <div className="flex gap-2">
            <Button
              onClick={resetToDefaults}
              variant="outline"
              size="sm"
              className="flex-1 h-8 text-xs"
            >
              <i className="fas fa-undo mr-1 text-xs"></i>
              重設預設值
            </Button>
            <Button
              onClick={onToggle}
              variant="secondary"
              size="sm"
              className="flex-1 h-8 text-xs"
            >
              <i className="fas fa-check mr-1 text-xs"></i>
              完成設定
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}