package geminiv2

import (
	"testing"

	. "github.com/smartystreets/goconvey/convey"
)

func TestExtractImagesFromChatCompletions_arrayContent(t *testing.T) {
	Convey("choices[].message.content is an array with image_url parts", t, func() {
		raw := []byte(`{
			"choices":[{
				"message":{
					"content":[
						{"type":"text","text":"here"},
						{"type":"image_url","image_url":{"url":"https://cdn.g/a.png"}},
						{"type":"image_url","image_url":{"url":"data:image/png;base64,AAAA"}}
					]
				}
			}]
		}`)
		imgs := ExtractImagesFromChatCompletions(raw)
		So(imgs, ShouldResemble, []string{"https://cdn.g/a.png", "data:image/png;base64,AAAA"})
	})
}

func TestExtractImagesFromChatCompletions_stringContentWithDataURIs(t *testing.T) {
	Convey("choices[].message.content is a plain string with inlined data URIs", t, func() {
		raw := []byte(`{
			"choices":[{
				"message":{
					"content":"prefix data:image/png;base64,BBBBB and data:image/jpeg;base64,CCCC end"
				}
			}]
		}`)
		imgs := ExtractImagesFromChatCompletions(raw)
		So(imgs, ShouldContain, "data:image/png;base64,BBBBB")
		So(imgs, ShouldContain, "data:image/jpeg;base64,CCCC")
	})
}

func TestExtractImagesFromChatCompletions_multipleChoices(t *testing.T) {
	Convey("multiple choices each contribute images", t, func() {
		raw := []byte(`{
			"choices":[
				{"message":{"content":[{"type":"image_url","image_url":{"url":"u1"}}]}},
				{"message":{"content":[{"type":"image_url","image_url":{"url":"u2"}}]}}
			]
		}`)
		imgs := ExtractImagesFromChatCompletions(raw)
		So(imgs, ShouldResemble, []string{"u1", "u2"})
	})
}

func TestExtractImagesFromChatCompletions_noImagesReturnsEmpty(t *testing.T) {
	Convey("text-only response returns empty (nil-safe for caller)", t, func() {
		raw := []byte(`{"choices":[{"message":{"content":"just text"}}]}`)
		imgs := ExtractImagesFromChatCompletions(raw)
		So(imgs, ShouldBeEmpty)
	})
}

func TestExtractImagesFromChatCompletions_malformedReturnsEmpty(t *testing.T) {
	Convey("garbage input returns empty rather than panicking", t, func() {
		So(ExtractImagesFromChatCompletions([]byte("not json")), ShouldBeEmpty)
		So(ExtractImagesFromChatCompletions([]byte(`{}`)), ShouldBeEmpty)
		So(ExtractImagesFromChatCompletions(nil), ShouldBeEmpty)
	})
}

func TestBuildChatCompletionRequestForImage_textOnly(t *testing.T) {
	Convey("text-to-image: builds messages with plain text content + modalities", t, func() {
		body, err := BuildChatCompletionRequestForImage("nano-banana", "a cat wearing a hat", nil)
		So(err, ShouldBeNil)
		So(string(body), ShouldContainSubstring, `"model":"nano-banana"`)
		So(string(body), ShouldContainSubstring, `"modalities":["image","text"]`)
		So(string(body), ShouldContainSubstring, `"role":"user"`)
		So(string(body), ShouldContainSubstring, "a cat wearing a hat")
		So(string(body), ShouldContainSubstring, `"stream":false`)
	})
}

func TestBuildChatCompletionRequestForImage_withImageURLs(t *testing.T) {
	Convey("image-to-image: image_urls become image_url parts in the user message", t, func() {
		body, err := BuildChatCompletionRequestForImage("nano-banana", "make it a cartoon",
			[]string{"https://cdn.x/in.png", "data:image/png;base64,ZZZZ"})
		So(err, ShouldBeNil)
		So(string(body), ShouldContainSubstring, `"type":"text"`)
		So(string(body), ShouldContainSubstring, "make it a cartoon")
		So(string(body), ShouldContainSubstring, `"type":"image_url"`)
		So(string(body), ShouldContainSubstring, "https://cdn.x/in.png")
		So(string(body), ShouldContainSubstring, "data:image/png;base64,ZZZZ")
	})
}
