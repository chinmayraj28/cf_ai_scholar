"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Download, FileText, Upload, Send, MessageSquare, Search } from "lucide-react"
import ReactMarkdown from "react-markdown"
import html2canvas from "html2canvas"
import jsPDF from "jspdf"
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, ExternalHyperlink } from "docx"
import { saveAs } from "file-saver"

interface ResearchResult {
  query: string
  answer: string
  sources: Array<{
    title: string
    url: string
  }>
}

interface ChatMessage {
  role: "user" | "ai"
  content: string
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"research" | "chat">("research")
  
  // Research State
  const [query, setQuery] = useState("")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [result, setResult] = useState<ResearchResult | null>(null)
  const [status, setStatus] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  // PDF Chat State
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [isChatting, setIsChatting] = useState(false)

  // --- Research Logic ---
  useEffect(() => {
    if (!sessionId) return

    const checkStatus = async () => {
      const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787"
      
      try {
        const response = await fetch(`${workerUrl}/api/status/${sessionId}`)
        
        if (response.status === 202) {
          setStatus("Researching... (Planning -> Fetching -> Writing)")
          return
        }

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json() as ResearchResult
        setResult(data)
        setStatus("Research complete!")
        setIsLoading(false)
        setSessionId(null)
      } catch (error) {
        setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`)
        setIsLoading(false)
        setSessionId(null)
      }
    }

    const interval = setInterval(checkStatus, 3000)
    checkStatus()

    return () => clearInterval(interval)
  }, [sessionId])

  const runResearch = async () => {
    if (!query.trim()) return
    setIsLoading(true)
    setStatus("Initializing deep research agents...")
    setResult(null)

    const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787"

    try {
      const response = await fetch(`${workerUrl}/api/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })
      const data = await response.json() as { sessionId: string }
      setSessionId(data.sessionId)
    } catch (error) {
      setStatus("Error starting research")
      setIsLoading(false)
    }
  }

  // --- PDF Logic ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      // Dynamic import for PDF.js to avoid SSR issues
      const pdfjsLib = await import('pdfjs-dist')
      // Set worker src to a CDN to avoid complex webpack config
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise
      let fullText = ""

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items.map((item: any) => item.str).join(" ")
        fullText += pageText + "\n"
      }

      const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787"
      const response = await fetch(`${workerUrl}/api/pdf/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullText, filename: file.name }),
      })

      const data = await response.json() as { documentId: string }
      setDocumentId(data.documentId)
      setChatMessages([{ role: "ai", content: `Ready to chat about ${file.name}!` }])
    } catch (error) {
      console.error(error)
      alert("Failed to process PDF")
    } finally {
      setIsUploading(false)
    }
  }

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !documentId) return

    const userMsg = chatInput
    setChatMessages(prev => [...prev, { role: "user", content: userMsg }])
    setChatInput("")
    setIsChatting(true)

    const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL || "http://localhost:8787"
    
    try {
      const response = await fetch(`${workerUrl}/api/pdf/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: userMsg, documentId }),
      })
      const data = await response.json() as { answer: string }
      setChatMessages(prev => [...prev, { role: "ai", content: data.answer }])
    } catch (error) {
      setChatMessages(prev => [...prev, { role: "ai", content: "Error getting response." }])
    } finally {
      setIsChatting(false)
    }
  }

  // --- Download Logic ---
  const downloadPDF = async () => {
    if (!reportRef.current) return
    const element = reportRef.current
    const canvas = await html2canvas(element, { scale: 2 })
    const imgData = canvas.toDataURL("image/png")
    const pdf = new jsPDF("p", "mm", "a4")
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pdfWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    let heightLeft = imgHeight
    let position = 0

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
    heightLeft -= pdfHeight
    while (heightLeft >= 0) {
      position = heightLeft - imgHeight
      pdf.addPage()
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight)
      heightLeft -= pdfHeight
    }
    pdf.save("research-report.pdf")
  }

  const downloadDOCX = () => {
    if (!result) return
    const children = []
    children.push(
      new Paragraph({ text: "Research Report", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
      new Paragraph({ text: result.query, heading: HeadingLevel.HEADING_2, alignment: AlignmentType.CENTER }),
      new Paragraph({ text: `Generated on ${new Date().toLocaleDateString()}`, alignment: AlignmentType.CENTER, spacing: { after: 400 } })
    )
    
    const lines = String(result.answer).split("\n")
    lines.forEach((line) => {
      if (line.startsWith("## ")) {
        children.push(new Paragraph({ text: line.replace("## ", ""), heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }))
      } else if (line.startsWith("### ")) {
        children.push(new Paragraph({ text: line.replace("### ", ""), heading: HeadingLevel.HEADING_3, spacing: { before: 300, after: 100 } }))
      } else if (line.trim() !== "" && !line.startsWith("# ")) {
        children.push(new Paragraph({ children: [new TextRun(line)], spacing: { after: 200 } }))
      }
    })

    children.push(new Paragraph({ text: "Verified Sources", heading: HeadingLevel.HEADING_2, spacing: { before: 600, after: 300 } }))
    result.sources.forEach((source) => {
        children.push(new Paragraph({
            children: [new ExternalHyperlink({ children: [new TextRun({ text: source.title, style: "Hyperlink" })], link: source.url })],
            bullet: { level: 0 } 
        }))
    })

    const doc = new Document({ sections: [{ properties: {}, children: children }] })
    Packer.toBlob(doc).then((blob) => saveAs(blob, "research-report.docx"))
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">AI Assistant</h1>
          <p className="text-slate-500">Deep Research & Document Analysis</p>
        </div>

        <div className="flex justify-center gap-4 mb-8">
          <Button 
            variant={activeTab === "research" ? "default" : "outline"}
            onClick={() => setActiveTab("research")}
            className="w-40"
          >
            <Search className="mr-2 h-4 w-4" /> Deep Research
          </Button>
          <Button 
            variant={activeTab === "chat" ? "default" : "outline"}
            onClick={() => setActiveTab("chat")}
            className="w-40"
          >
            <MessageSquare className="mr-2 h-4 w-4" /> Chat with PDF
          </Button>
        </div>

        {activeTab === "research" ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Deep Research Project</CardTitle>
                <CardDescription>Enter a topic for comprehensive multi-agent analysis</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="e.g., The future of solid state batteries"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="min-h-[100px]"
                  disabled={isLoading}
                />
                <Button onClick={runResearch} disabled={isLoading} className="w-full">
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Start Research"}
                </Button>
                {status && <p className="text-sm text-center text-slate-500 animate-pulse">{status}</p>}
              </CardContent>
            </Card>

            {result && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold text-slate-800">Research Complete</h2>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={downloadDOCX} className="bg-white hover:bg-slate-50">
                      <FileText className="mr-2 h-4 w-4" /> DOCX
                    </Button>
                    <Button variant="outline" onClick={downloadPDF} className="bg-white hover:bg-slate-50">
                      <Download className="mr-2 h-4 w-4" /> PDF
                    </Button>
                  </div>
                </div>

                <div className="flex justify-center">
                  <div ref={reportRef} className="bg-white w-full max-w-[210mm] min-h-[297mm] p-[20mm] shadow-xl mb-8 text-slate-900">
                    <div className="mb-12 border-b pb-8">
                      <p className="text-sm text-slate-500 uppercase tracking-widest mb-2">Research Report</p>
                      <h1 className="text-4xl font-serif font-bold text-slate-900 mb-4 leading-tight capitalize">{result.query}</h1>
                      <div className="flex items-center text-sm text-slate-500 space-x-4">
                        <span>Generated by AI Agent</span>
                        <span>•</span>
                        <span>{new Date().toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="prose prose-slate max-w-none prose-headings:font-serif prose-headings:font-bold prose-p:text-justify">
                      <ReactMarkdown
                        components={{
                          h1: ({node, ...props}) => <h2 className="text-2xl font-serif font-bold mt-8 mb-4 border-b pb-2" {...props} />,
                          h2: ({node, ...props}) => <h3 className="text-xl font-serif font-semibold mt-6 mb-3" {...props} />,
                          p: ({node, ...props}) => <p className="mb-4 text-slate-700 leading-relaxed" {...props} />,
                        }}
                      >
                        {String(result.answer).replace(/^# .+/m, "")}
                      </ReactMarkdown>
                    </div>
                    <div className="mt-16 pt-8 border-t break-inside-avoid">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-6">Sources</h3>
                      <div className="grid grid-cols-1 gap-2">
                        {result.sources.map((s, i) => (
                          <div key={i} className="flex items-baseline text-sm">
                            <span className="text-slate-400 mr-2">{i + 1}.</span>
                            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-blue-600 hover:underline truncate block">{s.title}</a>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <Card className="min-h-[600px] flex flex-col">
            <CardHeader>
              <CardTitle>Chat with PDF</CardTitle>
              <CardDescription>Upload a document and ask questions</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
              {!documentId ? (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 bg-slate-50">
                  {isUploading ? (
                    <div className="text-center">
                      <Loader2 className="h-10 w-10 animate-spin mx-auto mb-4 text-blue-600" />
                      <p>Analyzing document...</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload className="h-10 w-10 mx-auto mb-4 text-slate-400" />
                      <p className="mb-4 text-slate-600">Upload a PDF to start chatting</p>
                      <Input 
                        type="file" 
                        accept=".pdf"
                        onChange={handleFileUpload}
                        className="max-w-xs mx-auto"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto space-y-4 p-4 border rounded-lg bg-white h-[400px]">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                          <div className="prose prose-sm max-w-none dark:prose-invert break-words">
                            <ReactMarkdown
                              components={{
                                h1: ({node, ...props}) => <h1 className="text-lg font-bold mb-2" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-base font-bold mb-2" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-sm font-bold mb-1" {...props} />,
                                ul: ({node, ...props}) => <ul className="list-disc pl-4 mb-2" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal pl-4 mb-2" {...props} />,
                                li: ({node, ...props}) => <li className="mb-1" {...props} />,
                                p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                                strong: ({node, ...props}) => <strong className="font-bold" {...props} />,
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    ))}
                    {isChatting && (
                      <div className="flex justify-start">
                        <div className="bg-slate-100 p-3 rounded-lg flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" /> Thinking...
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input 
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Ask a question about the document..."
                      onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                    />
                    <Button onClick={sendChatMessage} disabled={isChatting}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
