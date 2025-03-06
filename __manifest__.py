{
    # Tên module
    'name': 'Investor VNPay Odoo 18.0',
    'version': '1.0',

    # Loại module
    'category': 'Investor VNPay',
    "author": "Đặng Thành Nhân",
    
    # Độ ưu tiên module trong list module
    # Số càng nhỏ, độ ưu tiên càng cao
    #### Chấp nhận số âm
    'sequence': 0,

    # Mô tả module
    'summary': 'Module này để cho các nhà đầu tư nạp tiền vào với nhà cung cấp VNPay, và thanh toán bằng VNPay',
    'description': '',
    # 'depends': ["base","product", "investor", "payment"],
    'depends': ["base","product", "payment", "point_of_sale"],
    'installable': True,
    'auto_install': True,
    'application': True,
    'data': [
        "views/menu_item.xml",
        "views/payment_vnpay_view.xml",
        "views/payment_vnpay_template.xml",
        "data/payment_method_data.xml",
        "data/payment_provider_data.xml",
        "data/pos_payment_method.xml"
    ],

    'assets': {
        'web.assets_backend':
        [
            'investor_vnpay_odoo/static/src/js/*.js',
            'investor_vnpay_odoo/static/src/xml/*.xml',
        ],
#         Nhóm tài nguyên này được sử dụng cho màn hình Point of Sale (POS) trong Odoo.
# Các tệp được liệt kê trong nhóm này sẽ được tải khi người dùng mở ứng dụng POS.
        'point_of_sale._assets_pos':[
          'investor_vnpay_odoo/static/src/online_payment_popup/**/*',
        ],
#         Nhóm tài nguyên này cũng được sử dụng cho ứng dụng Point of Sale , nhưng nó tập trung vào các tài nguyên được tối ưu hóa cho môi trường sản xuất (production).
# Các tệp trong nhóm này thường được nén (minified) và tối ưu hóa để cải thiện hiệu suất.
        # "point_of_sale.assets_prod": [ 
        #     'investor_vnpay_odoo/static/src/online_payment_popup/**/*',
        # ],
    },
    'license': 'LGPL-3',
}
