function fn_ready(){
    // AUIGrid 그리드를 생성합니다.
    createAUIGrid();
    // Kendo UI Component 생성합니다.
    createKendoConponents();
    // 이벤트 바인드
    eventBind();
    //조회
    fn_SEARCH01();
};

function createOrderRow(orderId, customerId, productCode, quantity, unitPrice, discountRate, orderStatus, deliveryDate){
    return {
        orderId,
        customerId,
        productCode,
        quantity,
        unitPrice,
        discountRate,
        orderStatus,
        deliveryDate,
    };
}

// 비교 예시 1: 한 줄로 표시했지만 열이 맞지 않아, 위아래 값 비교가 어렵습니다.
const compactOrderRows = [
    createOrderRow("ORDER-001", "CUSTOMER-ALPHA", "PRODUCT-A", 1, 125000, 0, "READY", "2026-09-24"),
    createOrderRow("ORDER-002", "CUSTOMER-BETA", "PRODUCT-B-LONG", 12, 8900, 10, "SHIPPING", "2026-09-25"),
    createOrderRow("ORDER-003", "CUSTOMER-GAMMA", "PRODUCT-C", 3, 45000, 5, "COMPLETED", "2026-09-26"),
];

// 비교 예시 2: 같은 역할의 인자를 열로 맞춰, 위아래 값 비교가 쉽습니다.
//                 ORDER ID    CUSTOMER ID       PRODUCT CODE      QTY  PRICE   DISCOUNT  STATUS       DELIVERY DATE
const alignedOrderRows = [
    createOrderRow("ORDER-001", "CUSTOMER-ALPHA", "PRODUCT-A",      1,   125000,  0,        "READY",      "2026-09-24"),
    createOrderRow("ORDER-002", "CUSTOMER-BETA",  "PRODUCT-B-LONG", 12,  8900,    10,       "SHIPPING",   "2026-09-25"),
    createOrderRow("ORDER-003", "CUSTOMER-GAMMA", "PRODUCT-C",      3,   45000,   5,        "COMPLETED",  "2026-09-26"),
];
