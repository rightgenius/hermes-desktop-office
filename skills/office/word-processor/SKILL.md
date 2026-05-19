---
name: word-processor
description: 创建、编辑和转换 Word 文档。支持生成报告、合同、信函等文档，添加表格、图片、页眉页脚，以及导出为 PDF。
category: office
---

# Word Processor Skill

使用 Python 的 `python-docx` 库创建和编辑 Word 文档。

## 能力

- 创建新的 DOCX 文件
- 添加标题、段落、列表
- 插入表格、图片
- 设置页眉页脚、页码
- 导出为 PDF（需要系统安装 LibreOffice）

## 使用方式

通过 `scripts/word_processor.py` 脚本调用：

```bash
python word_processor.py --title "项目报告" --output report.docx
```

## 依赖

- `python-docx` (Python 库)
- LibreOffice（可选，用于 PDF 导出）
