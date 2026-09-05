from app.services.portfolio import filter_date_range, parse_portfolio_csv


def test_parse_chinese_csv_with_comma_in_currency():
    content = '日期,總價值\n2026-01-01,"$1,234.50"\n2026-01-02,"$1,300.00"\n'.encode("utf-8-sig")
    df = parse_portfolio_csv(content)
    assert df["Value"].tolist() == [1234.5, 1300.0]
    assert df["Change"].tolist() == [0, 65.5]


def test_filter_ytd():
    content = "日期,總價值\n2025-12-30,100\n2026-01-02,120\n".encode()
    df = parse_portfolio_csv(content)
    result = filter_date_range(df, "YTD")
    assert len(result) == 1
    assert result.iloc[0]["Value"] == 120
