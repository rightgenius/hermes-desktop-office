---
name: excel-processor
description: 创建、编辑和转换 Excel 电子表格。支持生成报表、数据分析、图表、条件格式，以及导出为 CSV/PDF。
category: office
---

# Excel Processor Skill

使用 Python 的 `openpyxl` 库创建和编辑 Excel 电子表格。

## 能力

- 创建新的 XLSX 文件
- 添加工作表、数据行
- 设置单元格格式（字体、颜色、边框、对齐）
- 创建图表（柱状图、折线图、饼图）
- 条件格式、数据验证
- 导出为 CSV

## 使用方式

通过 `scripts/excel_processor.py` 脚本调用：

```bash
python excel_processor.py --title "销售报表" --output sales.xlsx
```

## 依赖

- `openpyxl` (Python 库)
