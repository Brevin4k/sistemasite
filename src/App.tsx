/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, FormEvent } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { 
  ShoppingBag, 
  User, 
  Trash2, 
  Plus, 
  Edit,
  LogOut, 
  Package, 
  ChevronRight, 
  CheckCircle,
  Clock,
  Truck,
  CheckCircle2,
  XCircle,
  Menu,
  X,
  ArrowLeft,
  QrCode,
  Copy,
  MessageCircle,
  Send,
  Sparkles,
  TrendingDown,
  Play,
  Video
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  collection, 
  addDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  User as FirebaseUser
} from 'firebase/auth';
import { GoogleGenAI, Type } from "@google/genai";
import { db, auth } from './firebase';
import { cn } from './lib/utils';
import { seedProducts } from './seed';
import { Product, Order, OrderItem } from './types';

// --- Error Boundary Component ---

class GlobalErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Desculpe, algo deu errado.";
      try {
        const parsedError = JSON.parse(this.state.error?.message || "");
        if (parsedError.error?.includes("Missing or insufficient permissions")) {
          errorMessage = "Você não tem permissão para acessar estes dados. Verifique se você é um administrador.";
        }
      } catch (e) {}

      return (
        <div className="min-h-screen flex items-center justify-center bg-cream-50 px-4">
          <div className="max-w-md w-full bg-white p-10 rounded-[40px] shadow-2xl text-center border border-forest-50">
            <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-rose-100 shadow-sm">
              <XCircle className="w-10 h-10 text-rose-600" />
            </div>
            <h2 className="text-3xl font-serif font-bold text-forest-900 mb-4 tracking-tight">Ops! Algo deu errado</h2>
            <p className="text-forest-600 mb-10 font-medium">{errorMessage}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full forest-gradient text-white py-4 rounded-2xl font-bold text-lg hover:scale-105 transition-all shadow-lg"
            >
              Recarregar Página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Firestore Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Display a user-friendly message
  toast.error("Erro de permissão ou conexão com o banco de dados. Verifique se você tem permissão para esta ação.");
  throw new Error(JSON.stringify(errInfo));
}

// --- AI Chat Component ---

const AIChat = ({ products }: { products: Product[] }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([
    { role: 'model', text: 'Olá! Sou o assistente virtual da PerfumsDelivery. Como posso ajudar você a escolher o perfume ideal hoje?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({ 
        model: "gemini-3-flash-preview",
        contents: userMessage,
        config: {
          systemInstruction: `Você é o assistente de vendas da PerfumsDelivery, uma loja de perfumes que oferece preços melhores que o Boticário. 
          Seu objetivo é ajudar os clientes a escolherem perfumes. 
          Aqui está o catálogo atual: ${JSON.stringify(products.map(p => ({ name: p.name, price: p.price, originalPrice: p.originalPrice, description: p.description })))}.
          Sempre destaque que nossos preços são menores que os do Boticário. Seja educado, prestativo e use um tom "florestal/natural" nas suas respostas.`
        }
      });

      const text = response.text;
      setMessages(prev => [...prev, { role: 'model', text: text || 'Desculpe, não consegui processar sua mensagem.' }]);
    } catch (error) {
      console.error('Erro no chat:', error);
      setMessages(prev => [...prev, { role: 'model', text: 'Desculpe, tive um probleminha técnico. Pode repetir?' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100]">
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-20 right-0 w-[350px] h-[500px] bg-white rounded-3xl shadow-2xl border border-forest-100 flex flex-col overflow-hidden"
          >
            <div className="forest-gradient p-6 text-white flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold">Assistente Perfums</h3>
                  <p className="text-[10px] opacity-70 uppercase tracking-widest">Online agora</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-cream-50/30">
              {messages.map((msg, i) => (
                <div key={i} className={cn(
                  "flex",
                  msg.role === 'user' ? "justify-end" : "justify-start"
                )}>
                  <div className={cn(
                    "max-w-[80%] p-4 rounded-2xl text-sm shadow-sm",
                    msg.role === 'user' 
                      ? "bg-forest-800 text-white rounded-tr-none" 
                      : "bg-white text-forest-900 rounded-tl-none border border-forest-50"
                  )}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-forest-50 flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-forest-300 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-forest-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-forest-300 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-forest-50 bg-white">
              <div className="flex items-center space-x-2 bg-gray-50 rounded-2xl px-4 py-2 border border-gray-100">
                <input 
                  type="text"
                  placeholder="Tire sua dúvida..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-sm py-2"
                />
                <button type="submit" className="text-forest-800 hover:text-forest-600 transition-colors">
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-16 h-16 forest-gradient text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-all active:scale-95 group"
      >
        <MessageCircle className="w-8 h-8 group-hover:rotate-12 transition-transform" />
      </button>
    </div>
  );
};

// --- Components ---

const Navbar = ({ cartCount, user }: { cartCount: number; user: FirebaseUser | null }) => {
  return (
    <nav className="sticky top-0 z-50 bg-cream-50/80 backdrop-blur-md border-b border-forest-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          <Link to="/" className="flex items-center space-x-2 group">
            <div className="w-10 h-10 forest-gradient rounded-xl flex items-center justify-center group-hover:rotate-6 transition-transform">
              <ShoppingBag className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-serif font-bold text-forest-900 tracking-tight">Perfums<span className="text-gold-500">Delivery</span></span>
          </Link>
          
          <div className="flex items-center space-x-6">
            <Link to="/admin" className="text-forest-600 hover:text-forest-900 font-bold transition-colors flex items-center space-x-2">
              <User className="w-5 h-5" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
            <Link to="/cart" className="relative group">
              <div className="bg-white p-3 rounded-xl border border-forest-100 shadow-sm group-hover:bg-forest-50 transition-colors">
                <ShoppingBag className="w-6 h-6 text-forest-800" />
                {cartCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-rose-600 text-white text-[10px] font-bold w-6 h-6 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                    {cartCount}
                  </span>
                )}
              </div>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

const Catalog = ({ addToCart }: { addToCart: (p: Product) => void }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <AnimatePresence>
        {selectedVideo && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5, x: 20, y: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, x: 20, y: 20 }}
            className="fixed bottom-24 right-6 z-[110] w-48 h-48 rounded-full overflow-hidden border-4 border-emerald-400 shadow-2xl bg-black group"
          >
            <video 
              src={selectedVideo} 
              autoPlay 
              loop 
              muted 
              playsInline
              className="w-full h-full object-cover"
            />
            <button 
              onClick={() => setSelectedVideo(null)}
              className="absolute top-2 right-2 bg-black/50 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-16 text-center">
        <h1 className="text-5xl md:text-7xl font-serif font-bold text-forest-900 mb-6 tracking-tighter">
          Fragrâncias <span className="text-gold-500 italic">Exclusivas</span>
        </h1>
        <p className="text-lg text-forest-600 max-w-2xl mx-auto font-medium">
          Descubra o luxo do Boticário com preços que só a <span className="text-forest-800 font-bold">PerfumsDelivery</span> oferece.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-[40px] h-[500px] animate-pulse shadow-sm" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {products.map((product) => (
            <motion.div 
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="group bg-white rounded-[40px] overflow-hidden shadow-sm hover:shadow-2xl transition-all duration-500 border border-forest-50"
            >
              <div className="relative h-[350px] overflow-hidden cursor-pointer" onClick={() => product.videoUrl && setSelectedVideo(product.videoUrl)}>
                <img 
                  src={product.imageUrl} 
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-6 left-6 flex flex-col space-y-2">
                  <div className="bg-white/90 backdrop-blur-md px-4 py-1.5 rounded-full text-[10px] font-bold text-forest-800 uppercase tracking-widest shadow-sm">
                    Original Boticário
                  </div>
                  {product.originalPrice > product.price && (
                    <div className="bg-rose-500 text-white px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg flex items-center space-x-1">
                      <TrendingDown className="w-3 h-3" />
                      <span>-{Math.round((1 - product.price / product.originalPrice) * 100)}% OFF</span>
                    </div>
                  )}
                </div>
                {product.videoUrl && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/10">
                    <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30">
                      <Play className="w-8 h-8 text-white fill-white" />
                    </div>
                  </div>
                )}
              </div>
              <div className="p-8">
                <h3 className="text-2xl font-serif font-bold text-forest-900 mb-2 group-hover:text-gold-500 transition-colors">{product.name}</h3>
                <p className="text-forest-600 text-sm mb-6 line-clamp-2 leading-relaxed">{product.description}</p>
                
                <div className="flex items-end justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-400 font-medium">No Boticário:</span>
                      <span className="text-sm text-gray-400 line-through">R$ {product.originalPrice?.toFixed(2) || (product.price * 1.2).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-forest-600 font-bold uppercase tracking-tighter">Nosso Preço:</span>
                      <span className="text-3xl font-serif font-bold text-forest-900">R$ {product.price.toFixed(2)}</span>
                    </div>
                  </div>
                  <button 
                    onClick={() => addToCart(product)}
                    className="w-14 h-14 forest-gradient text-white rounded-2xl flex items-center justify-center hover:scale-110 transition-all active:scale-95 shadow-lg"
                  >
                    <Plus className="w-7 h-7" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

const CartPage = ({ cart, updateQuantity, removeFromCart }: { 
  cart: OrderItem[]; 
  updateQuantity: (id: string, q: number) => void;
  removeFromCart: (id: string) => void;
}) => {
  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  if (cart.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <ShoppingBag className="w-20 h-20 text-gray-200 mx-auto mb-6" />
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Seu carrinho está vazio</h2>
        <p className="text-gray-600 mb-8">Parece que você ainda não escolheu seu perfume ideal.</p>
        <Link to="/" className="inline-flex items-center space-x-2 bg-rose-600 text-white px-8 py-4 rounded-2xl font-bold hover:bg-rose-700 transition-all">
          <ChevronRight className="w-5 h-5 rotate-180" />
          <span>Voltar ao Catálogo</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Seu Carrinho</h1>
      <div className="space-y-6 mb-12">
        {cart.map((item) => (
          <div key={item.productId} className="flex items-center space-x-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex-1">
              <h3 className="font-bold text-gray-900">{item.name}</h3>
              <p className="text-rose-600 font-medium">R$ {item.price.toFixed(2)}</p>
            </div>
            <div className="flex items-center space-x-3 bg-gray-50 rounded-lg p-1">
              <button 
                onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-md transition-colors"
              >-</button>
              <span className="font-bold w-4 text-center">{item.quantity}</span>
              <button 
                onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                className="w-8 h-8 flex items-center justify-center hover:bg-white rounded-md transition-colors"
              >+</button>
            </div>
            <button 
              onClick={() => removeFromCart(item.productId)}
              className="p-2 text-gray-400 hover:text-rose-600 transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 text-white p-8 rounded-3xl shadow-xl">
        <div className="flex justify-between items-center mb-8">
          <span className="text-gray-400 text-lg">Total do Pedido</span>
          <span className="text-3xl font-bold">R$ {total.toFixed(2)}</span>
        </div>
        <Link 
          to="/checkout" 
          className="w-full bg-rose-600 text-white py-5 rounded-2xl font-bold text-xl hover:bg-rose-700 transition-all flex items-center justify-center space-x-3"
        >
          <span>Finalizar Pedido</span>
          <ChevronRight className="w-6 h-6" />
        </Link>
      </div>
    </div>
  );
};

const CheckoutPage = ({ cart, clearCart }: { cart: OrderItem[]; clearCart: () => void }) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState<string | null>(null);

  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    setIsSubmitting(true);

    try {
      const orderData = {
        customerName: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        items: cart,
        total: total,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'orders'), orderData);
      setOrderComplete(docRef.id);
      clearCart();
      toast.success('Pedido realizado com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'orders');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (orderComplete) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8">
          <CheckCircle className="w-12 h-12" />
        </div>
        <h2 className="text-4xl font-extrabold text-gray-900 mb-4">Pedido Confirmado!</h2>
        <p className="text-lg text-gray-600 mb-12">
          Obrigado, {formData.name}. Seu pedido #{orderComplete.slice(-6)} foi recebido e está aguardando pagamento.
        </p>

        <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-xl mb-12 text-left">
          <h3 className="text-xl font-bold mb-6 flex items-center space-x-2">
            <QrCode className="w-6 h-6 text-rose-600" />
            <span>Pagamento via Pix</span>
          </h3>
          <div className="flex flex-col items-center space-y-6">
            <div className="w-48 h-48 bg-gray-100 rounded-2xl flex items-center justify-center border-2 border-dashed border-gray-300">
              <QrCode className="w-32 h-32 text-gray-400" />
            </div>
            <div className="w-full space-y-4">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <p className="text-xs text-gray-500 uppercase font-bold mb-1">Chave Pix (E-mail)</p>
                <div className="flex justify-between items-center">
                  <span className="font-mono font-bold">pagamentos@essencia.com</span>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText('pagamentos@essencia.com');
                      toast.success('Chave copiada!');
                    }}
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-500 text-center italic">
                Após o pagamento, envie o comprovante para nosso WhatsApp com o número do pedido.
              </p>
            </div>
          </div>
        </div>

        <Link to="/" className="text-rose-600 font-bold hover:underline">Voltar para a loja</Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 grid grid-cols-1 lg:grid-cols-2 gap-12">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Finalizar Compra</h1>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Nome Completo</label>
            <input 
              required
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rose-500 outline-none transition-all"
              placeholder="Como podemos te chamar?"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">E-mail</label>
            <input 
              required
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rose-500 outline-none transition-all"
              placeholder="seu@email.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Telefone / WhatsApp</label>
            <input 
              required
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({...formData, phone: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rose-500 outline-none transition-all"
              placeholder="(00) 00000-0000"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">Endereço de Entrega</label>
            <textarea 
              required
              rows={3}
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rose-500 outline-none transition-all"
              placeholder="Rua, número, bairro, cidade..."
            />
          </div>
          <button 
            disabled={isSubmitting}
            type="submit"
            className="w-full bg-rose-600 text-white py-5 rounded-2xl font-bold text-xl hover:bg-rose-700 transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Processando...' : 'Confirmar Pedido'}
          </button>
        </form>
      </div>

      <div className="bg-gray-50 p-8 rounded-3xl border border-gray-200 h-fit sticky top-24">
        <h3 className="text-xl font-bold mb-6">Resumo do Pedido</h3>
        <div className="space-y-4 mb-8">
          {cart.map(item => (
            <div key={item.productId} className="flex justify-between text-sm">
              <span className="text-gray-600">{item.quantity}x {item.name}</span>
              <span className="font-bold">R$ {(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-200 pt-4 flex justify-between items-center">
          <span className="text-lg font-bold">Total</span>
          <span className="text-2xl font-extrabold text-rose-600">R$ {total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};

const AdminPanel = ({ user }: { user: FirebaseUser | null }) => {
  const [activeTab, setActiveTab] = useState<'products' | 'orders'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newProduct, setNewProduct] = useState({ name: '', description: '', price: '', originalPrice: '', imageUrl: '', videoUrl: '' });
  const [editProductForm, setEditProductForm] = useState({ name: '', description: '', price: '', originalPrice: '', imageUrl: '', videoUrl: '' });
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  
  // Auth state
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleImportFromUrl = async () => {
    if (!importUrl) {
      toast.error('Por favor, insira um link do Boticário.');
      return;
    }
    
    setIsImporting(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Extraia as informações do produto deste link do Boticário: ${importUrl}. 
        IMPORTANTE: A 'imageUrl' deve ser a URL da imagem principal do produto (geralmente a maior e mais clara). 
        A URL da imagem deve obrigatoriamente terminar em .jpg, .jpeg ou .png. Evite ícones, banners ou formatos webp.
        Retorne apenas um JSON com os campos: name, price (número), imageUrl, description.`,
        config: {
          tools: [{ urlContext: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              price: { type: Type.NUMBER },
              imageUrl: { 
                type: Type.STRING,
                description: "URL da imagem principal do produto em formato JPG ou PNG"
              },
              description: { type: Type.STRING },
            },
            required: ["name", "price", "imageUrl", "description"]
          }
        },
      });

      const data = JSON.parse(response.text);
      setNewProduct({
        name: data.name || '',
        originalPrice: data.price?.toString() || '',
        price: (data.price * 0.9).toFixed(2), // 10% discount by default
        imageUrl: data.imageUrl || '',
        description: data.description || '',
        videoUrl: '',
      });
      toast.success('Informações importadas com sucesso!');
      setImportUrl('');
    } catch (error) {
      console.error('Erro ao importar:', error);
      toast.error('Não foi possível importar os dados. Verifique o link ou tente manualmente.');
    } finally {
      setIsImporting(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    
    const unsubProducts = onSnapshot(query(collection(db, 'products'), orderBy('createdAt', 'desc')), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    const unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'orders');
    });

    return () => {
      unsubProducts();
      unsubOrders();
    };
  }, [user]);

  const handleAddProduct = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'products'), {
        ...newProduct,
        price: parseFloat(newProduct.price),
        originalPrice: parseFloat(newProduct.originalPrice),
        createdAt: new Date().toISOString()
      });
      setIsAddingProduct(false);
      setNewProduct({ name: '', description: '', price: '', originalPrice: '', imageUrl: '', videoUrl: '' });
      toast.success('Produto adicionado!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }
  };

  const handleEditProduct = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    try {
      await updateDoc(doc(db, 'products', editingProduct.id), {
        ...editProductForm,
        price: parseFloat(editProductForm.price),
        originalPrice: parseFloat(editProductForm.originalPrice),
      });
      setIsEditingProduct(false);
      setEditingProduct(null);
      toast.success('Produto atualizado!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `products/${editingProduct.id}`);
    }
  };

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setEditProductForm({
      name: product.name,
      description: product.description,
      price: product.price.toString(),
      originalPrice: product.originalPrice?.toString() || '',
      imageUrl: product.imageUrl,
      videoUrl: product.videoUrl || ''
    });
    setIsEditingProduct(true);
  };

  const handleDeleteProduct = async (id: string) => {
    toast("Tem certeza que deseja excluir este produto?", {
      action: {
        label: "Excluir",
        onClick: async () => {
          try {
            await deleteDoc(doc(db, 'products', id));
            toast.success('Produto excluído!');
          } catch (error) {
            handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
          }
        },
      },
    });
  };

  const handleUpdateOrderStatus = async (id: string, status: Order['status']) => {
    try {
      await updateDoc(doc(db, 'orders', id), { status });
      toast.success('Status atualizado!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${id}`);
    }
  };

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Preencha todos os campos.");
      return;
    }
    
    setIsLoading(true);
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
        toast.success("Conta criada com sucesso!");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success("Login realizado com sucesso!");
      }
    } catch (error: any) {
      console.error("Erro na autenticação:", error);
      let message = "Ocorreu um erro. Tente novamente.";
      if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        message = isRegistering ? "Erro ao criar conta. Verifique os dados." : "E-mail ou senha incorretos. Se ainda não tem conta, use a aba 'Registrar'.";
      }
      if (error.code === 'auth/wrong-password') message = "Senha incorreta.";
      if (error.code === 'auth/invalid-email') message = "E-mail inválido.";
      if (error.code === 'auth/email-already-in-use') message = "Este e-mail já está em uso.";
      if (error.code === 'auth/weak-password') message = "A senha deve ter pelo menos 6 caracteres.";
      if (error.code === 'auth/operation-not-allowed') {
        message = "O login por E-mail/Senha está desativado no Firebase Console. Por favor, ative-o em Authentication > Sign-in method.";
      }
      toast.error(message, { duration: 6000 });
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <div className="text-center mb-10">
          <div className="w-20 h-20 forest-gradient rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl">
            <User className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-4xl font-serif font-bold text-forest-900 mb-4 tracking-tight">
            {isRegistering ? 'Criar Conta' : 'Acesso Restrito'}
          </h2>
          <p className="text-forest-600 font-medium">
            {isRegistering ? 'Registre-se para gerenciar sua perfumaria.' : 'Faça login para gerenciar sua perfumaria exclusiva.'}
          </p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6 bg-white p-8 rounded-[32px] border border-forest-50 shadow-xl">
          <div className="space-y-2">
            <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">E-mail</label>
            <input 
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
              placeholder="seu@email.com"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">Senha</label>
            <input 
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
              placeholder="••••••••"
            />
          </div>
          <button 
            disabled={isLoading}
            type="submit"
            className="w-full forest-gradient text-white py-5 rounded-2xl font-bold text-lg hover:scale-105 transition-all shadow-lg disabled:opacity-50"
          >
            {isLoading ? 'Processando...' : (isRegistering ? 'Registrar' : 'Entrar')}
          </button>
        </form>

        <div className="mt-8 text-center">
          <button 
            onClick={() => setIsRegistering(!isRegistering)}
            className="text-forest-600 font-bold hover:text-gold-600 transition-colors"
          >
            {isRegistering ? 'Já tem uma conta? Entre aqui' : 'Não tem conta? Registre-se'}
          </button>
        </div>
      </div>
    );
  }

  const allowedAdmins = ["gustavolangue@outlook.com", "admin@perfums.com"];
  if (!allowedAdmins.includes(user.email || "")) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 bg-rose-50 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-rose-100 shadow-sm">
          <XCircle className="w-10 h-10 text-rose-600" />
        </div>
        <h2 className="text-4xl font-serif font-bold text-forest-900 mb-4 tracking-tight">Acesso Pendente</h2>
        <p className="text-forest-600 mb-10 font-medium">Sua conta ({user.email}) foi criada, mas ainda não tem permissão de administrador.</p>
        <button 
          onClick={() => signOut(auth)}
          className="text-rose-600 font-bold hover:underline flex items-center justify-center space-x-2 mx-auto"
        >
          <LogOut className="w-5 h-5" />
          <span>Sair e tentar com outra conta</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-16 gap-8">
        <div>
          <h1 className="text-4xl font-serif font-bold text-forest-900 tracking-tight">Painel Administrativo</h1>
          <div className="flex items-center space-x-2 mt-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-forest-600 font-medium">Bem-vindo, <span className="text-forest-900 font-bold">{user.displayName}</span></p>
          </div>
        </div>
        <div className="flex items-center space-x-6">
          <button 
            onClick={async () => {
              await seedProducts();
              toast.success('Produtos iniciais adicionados!');
            }}
            className="text-sm text-forest-400 hover:text-forest-600 font-medium underline decoration-forest-200 underline-offset-4 transition-colors"
          >
            Adicionar Amostras
          </button>
          <button 
            onClick={() => signOut(auth)}
            className="flex items-center space-x-2 text-forest-600 hover:text-rose-600 font-bold transition-colors bg-white px-6 py-3 rounded-2xl border border-forest-100 shadow-sm"
          >
            <LogOut className="w-5 h-5" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      <div className="flex space-x-2 bg-white p-2 rounded-3xl mb-16 w-fit shadow-sm border border-forest-50">
        <button 
          onClick={() => setActiveTab('products')}
          className={cn(
            "px-10 py-4 rounded-2xl font-bold transition-all flex items-center space-x-2",
            activeTab === 'products' ? "forest-gradient text-white shadow-lg" : "text-forest-600 hover:bg-forest-50"
          )}
        >
          <ShoppingBag className="w-5 h-5" />
          <span>Produtos</span>
        </button>
        <button 
          onClick={() => setActiveTab('orders')}
          className={cn(
            "px-10 py-4 rounded-2xl font-bold transition-all flex items-center space-x-2",
            activeTab === 'orders' ? "forest-gradient text-white shadow-lg" : "text-forest-600 hover:bg-forest-50"
          )}
        >
          <Package className="w-5 h-5" />
          <span>Pedidos</span>
        </button>
      </div>

      {activeTab === 'products' ? (
        <div className="space-y-10">
          <div className="flex justify-between items-center">
            <h2 className="text-3xl font-serif font-bold text-forest-900">Gerenciar Perfumes</h2>
            <button 
              onClick={() => setIsAddingProduct(true)}
              className="forest-gradient text-white px-8 py-4 rounded-2xl font-bold flex items-center space-x-3 hover:scale-105 transition-all shadow-lg"
            >
              <Plus className="w-6 h-6" />
              <span>Novo Produto</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map(product => (
              <div key={product.id} className="bg-white p-6 rounded-[32px] border border-forest-50 shadow-sm flex items-center space-x-6 hover:shadow-xl transition-all group">
                <div className="relative w-24 h-24 rounded-2xl overflow-hidden">
                  <img src={product.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={product.name} />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif font-bold text-forest-900 text-lg">{product.name}</h3>
                  <div className="flex items-center space-x-2">
                    <span className="text-forest-800 font-bold">R$ {product.price.toFixed(2)}</span>
                    <span className="text-xs text-forest-300 line-through">R$ {product.originalPrice?.toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => openEditModal(product)}
                    className="p-3 text-forest-300 hover:text-forest-900 hover:bg-forest-50 rounded-xl transition-all"
                  >
                    <Edit className="w-6 h-6" />
                  </button>
                  <button 
                    onClick={() => handleDeleteProduct(product.id)}
                    className="p-3 text-forest-300 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                  >
                    <Trash2 className="w-6 h-6" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          <h2 className="text-3xl font-serif font-bold text-forest-900">Pedidos Recentes</h2>
          <div className="space-y-8">
            {orders.map(order => (
              <div key={order.id} className="bg-white p-10 rounded-[40px] border border-forest-50 shadow-sm hover:shadow-xl transition-all">
                <div className="flex flex-col lg:flex-row justify-between gap-12">
                  <div className="flex-1">
                    <div className="flex items-center space-x-4 mb-6">
                      <span className="text-xs font-bold uppercase tracking-widest text-forest-400 bg-forest-50 px-4 py-1.5 rounded-full">Pedido #{order.id.slice(-6)}</span>
                      <span className={cn(
                        "px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest",
                        order.status === 'pending' && "bg-amber-100 text-amber-700",
                        order.status === 'paid' && "bg-emerald-100 text-emerald-700",
                        order.status === 'shipped' && "bg-blue-100 text-blue-700",
                        order.status === 'delivered' && "bg-forest-100 text-forest-700",
                        order.status === 'cancelled' && "bg-rose-100 text-rose-700",
                      )}>
                        {order.status}
                      </span>
                    </div>
                    <h3 className="text-2xl font-serif font-bold text-forest-900 mb-3">{order.customerName}</h3>
                    <div className="flex flex-wrap gap-4 text-forest-600 text-sm mb-8 font-medium">
                      <div className="flex items-center space-x-2">
                        <User className="w-4 h-4" />
                        <span>{order.email}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <ShoppingBag className="w-4 h-4" />
                        <span>{order.phone}</span>
                      </div>
                    </div>
                    <p className="text-forest-600 text-sm mb-10 bg-cream-50 p-4 rounded-2xl border border-forest-50 italic">"{order.address}"</p>
                    
                    <div className="space-y-4">
                      <p className="text-xs font-bold text-forest-400 uppercase tracking-widest">Itens do Pedido</p>
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-xl border border-forest-50">
                          <span className="text-forest-800 font-bold">{item.quantity}x <span className="font-serif text-forest-900 ml-2">{item.name}</span></span>
                          <span className="font-bold text-forest-900">R$ {(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lg:w-80 flex flex-col justify-between items-end bg-forest-900 p-8 rounded-[32px] text-white shadow-2xl">
                    <div className="text-right w-full">
                      <p className="text-forest-300 text-xs uppercase font-bold tracking-widest mb-2">Valor Total</p>
                      <p className="text-5xl font-serif font-bold text-gold-500">R$ {order.total.toFixed(2)}</p>
                    </div>
                    
                    <div className="w-full space-y-4 mt-12">
                      <p className="text-xs font-bold text-forest-300 uppercase tracking-widest">Atualizar Status</p>
                      <select 
                        value={order.status}
                        onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value as Order['status'])}
                        className="w-full bg-forest-800 text-white px-6 py-4 rounded-2xl text-sm font-bold outline-none border border-forest-700 focus:ring-2 focus:ring-gold-500 transition-all appearance-none cursor-pointer"
                      >
                        <option value="pending">Aguardando Pagamento</option>
                        <option value="paid">Pagamento Confirmado</option>
                        <option value="shipped">Produto Enviado</option>
                        <option value="delivered">Pedido Entregue</option>
                        <option value="cancelled">Pedido Cancelado</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      <AnimatePresence>
        {isAddingProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingProduct(false)}
              className="absolute inset-0 bg-forest-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-10 border-b border-forest-50 flex justify-between items-center bg-cream-50">
                <div>
                  <h3 className="text-3xl font-serif font-bold text-forest-900">Novo Perfume</h3>
                  <p className="text-forest-600 font-medium">Adicione uma nova fragrância ao seu catálogo.</p>
                </div>
                <button onClick={() => setIsAddingProduct(false)} className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm border border-forest-50">
                  <X className="w-7 h-7 text-forest-900" />
                </button>
              </div>
              
              <div className="px-10 pt-10">
                <div className="bg-forest-900 p-8 rounded-[32px] shadow-xl border border-forest-800">
                  <label className="text-xs font-bold text-gold-500 uppercase tracking-widest mb-4 block">Importação Inteligente (Boticário)</label>
                  <div className="flex gap-4">
                    <input 
                      type="url"
                      placeholder="Cole o link do produto aqui..."
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      className="flex-1 bg-forest-800 text-white px-6 py-4 rounded-2xl border border-forest-700 focus:ring-2 focus:ring-gold-500 outline-none text-sm placeholder:text-forest-500"
                    />
                    <button 
                      type="button"
                      onClick={handleImportFromUrl}
                      disabled={isImporting}
                      className="bg-gold-500 text-forest-900 px-8 py-4 rounded-2xl font-bold text-sm hover:scale-105 transition-all disabled:opacity-50 flex items-center space-x-3 shadow-lg"
                    >
                      {isImporting ? (
                        <div className="w-5 h-5 border-3 border-forest-900/30 border-t-forest-900 rounded-full animate-spin" />
                      ) : (
                        <Plus className="w-5 h-5" />
                      )}
                      <span>{isImporting ? 'Importando...' : 'Importar'}</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-forest-400 mt-4 italic leading-relaxed">
                    * Nossa IA extrairá automaticamente o nome, preços, imagem e descrição diretamente do site oficial.
                  </p>
                </div>
              </div>

              <form onSubmit={handleAddProduct} className="p-10 space-y-8">
                <div className="space-y-3">
                  <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">Nome do Perfume</label>
                  <input 
                    required
                    type="text"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">Preço Boticário (R$)</label>
                    <input 
                      required
                      type="number"
                      step="0.01"
                      value={newProduct.originalPrice}
                      onChange={(e) => setNewProduct({...newProduct, originalPrice: e.target.value})}
                      className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">Nosso Preço (R$)</label>
                    <input 
                      required
                      type="number"
                      step="0.01"
                      value={newProduct.price}
                      onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
                      className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">URL da Imagem</label>
                  <input 
                    required
                    type="url"
                    value={newProduct.imageUrl}
                    onChange={(e) => setNewProduct({...newProduct, imageUrl: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">URL do Vídeo (Opcional)</label>
                  <input 
                    type="url"
                    value={newProduct.videoUrl}
                    onChange={(e) => setNewProduct({...newProduct, videoUrl: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
                    placeholder="https://exemplo.com/video.mp4"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">Descrição</label>
                  <textarea 
                    required
                    rows={3}
                    value={newProduct.description}
                    onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full forest-gradient text-white py-5 rounded-2xl font-bold text-xl hover:scale-105 transition-all shadow-xl"
                >
                  Salvar Produto no Catálogo
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Product Modal */}
      <AnimatePresence>
        {isEditingProduct && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditingProduct(false)}
              className="absolute inset-0 bg-forest-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-10 border-b border-forest-50 flex justify-between items-center bg-cream-50">
                <div>
                  <h3 className="text-3xl font-serif font-bold text-forest-900">Editar Perfume</h3>
                  <p className="text-forest-600 font-medium">Atualize as informações da fragrância.</p>
                </div>
                <button onClick={() => setIsEditingProduct(false)} className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm border border-forest-50">
                  <X className="w-7 h-7 text-forest-900" />
                </button>
              </div>

              <form onSubmit={handleEditProduct} className="p-10 space-y-8">
                <div className="space-y-3">
                  <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">Nome do Perfume</label>
                  <input 
                    required
                    type="text"
                    value={editProductForm.name}
                    onChange={(e) => setEditProductForm({...editProductForm, name: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
                  />
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">Preço Boticário (R$)</label>
                    <input 
                      required
                      type="number"
                      step="0.01"
                      value={editProductForm.originalPrice}
                      onChange={(e) => setEditProductForm({...editProductForm, originalPrice: e.target.value})}
                      className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">Nosso Preço (R$)</label>
                    <input 
                      required
                      type="number"
                      step="0.01"
                      value={editProductForm.price}
                      onChange={(e) => setEditProductForm({...editProductForm, price: e.target.value})}
                      className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">URL da Imagem</label>
                  <input 
                    required
                    type="url"
                    value={editProductForm.imageUrl}
                    onChange={(e) => setEditProductForm({...editProductForm, imageUrl: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">URL do Vídeo (Opcional)</label>
                  <input 
                    type="url"
                    value={editProductForm.videoUrl}
                    onChange={(e) => setEditProductForm({...editProductForm, videoUrl: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
                    placeholder="https://exemplo.com/video.mp4"
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-sm font-bold text-forest-900 uppercase tracking-widest">Descrição</label>
                  <textarea 
                    required
                    rows={3}
                    value={editProductForm.description}
                    onChange={(e) => setEditProductForm({...editProductForm, description: e.target.value})}
                    className="w-full px-6 py-4 rounded-2xl border border-forest-100 focus:ring-2 focus:ring-forest-800 outline-none font-medium bg-cream-50/50"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full forest-gradient text-white py-5 rounded-2xl font-bold text-xl hover:scale-105 transition-all shadow-xl"
                >
                  Atualizar Produto
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setAllProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    });

    return () => {
      unsubscribe();
      unsubProducts();
    };
  }, []);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.productId === product.id);
      if (existing) {
        return prev.map(item => 
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
    toast.success(`${product.name} adicionado ao carrinho!`);
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity < 1) return;
    setCart(prev => prev.map(item => item.productId === id ? { ...item, quantity } : item));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.productId !== id));
  };

  const clearCart = () => setCart([]);

  return (
    <GlobalErrorBoundary>
      <Router>
        <div className="min-h-screen bg-cream-50 text-forest-900 font-sans selection:bg-forest-100 selection:text-forest-900">
          <Navbar cartCount={cart.reduce((acc, i) => acc + i.quantity, 0)} user={user} />
          
          <main className="pb-20">
            <Routes>
              <Route path="/" element={<Catalog addToCart={addToCart} />} />
              <Route path="/cart" element={
                <CartPage 
                  cart={cart} 
                  updateQuantity={updateQuantity} 
                  removeFromCart={removeFromCart} 
                />
              } />
              <Route path="/checkout" element={<CheckoutPage cart={cart} clearCart={clearCart} />} />
              <Route path="/admin" element={<AdminPanel user={user} />} />
            </Routes>
          </main>

          <AIChat products={allProducts} />
          <Toaster position="bottom-right" richColors />
        </div>
      </Router>
    </GlobalErrorBoundary>
  );
}
