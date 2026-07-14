//
//  SafariWebExtensionHandler.swift
//  Safari_darktool Extension
//
//  Created by chenanqi on 2026/7/14.
//

import SafariServices

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [ SFExtensionMessageKey: [ "ok": true ] ]
        } else {
            response.userInfo = [ "message": [ "ok": true ] ]
        }

        context.completeRequest(returningItems: [ response ], completionHandler: nil)
    }

}
