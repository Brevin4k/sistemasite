/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, FormEvent } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { 
  ShoppingBag, 
  User, 
  Trash2, 
  Plus, 
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
  Copy
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
  User as FirebaseUser
} from 'firebase/auth';
import { GoogleGenAI, Type } from "@google/genai";
import { db, auth } from './firebase';
import { cn } from './lib/utils';
import { seedProducts } from './seed';
import { Product, Order, OrderItem } from './types';

// --- Components ---

const Navbar = ({ cartCount, user }: { cartCount: number; user: FirebaseUser | null }) => {
  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <ShoppingBag className="w-8 h-8 text-rose-600" />
            <span className="text-xl font-bold tracking-tight text-gray-900">Essência Delivery</span>
          </Link>
          
          <div className="flex items-center space-x-4">
            <Link to="/admin" className="p-2 text-gray-500 hover:text-rose-600 transition-colors">
              <User className="w-6 h-6" />
            </Link>
            <Link to="/cart" className="relative p-2 text-gray-500 hover:text-rose-600 transition-colors">
              <ShoppingBag className="w-6 h-6" />
              {cartCount > 0 && (
                <span className="absolute top-0 right-0 bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {cartCount}
                </span>
              )}
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

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(prods);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <header className="mb-12">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-4">Nossa Coleção</h1>
        <p className="text-lg text-gray-600 max-w-2xl">
          Descubra fragrâncias exclusivas selecionadas para você. Entrega rápida e pagamento seguro via Pix.
        </p>
      </header>

      {products.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-gray-900">Nenhum perfume disponível</h3>
          <p className="text-gray-500">Volte mais tarde para conferir as novidades.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {products.map((product) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100"
            >
              <div className="aspect-square overflow-hidden bg-gray-100 relative">
                <img
                  src={product.imageUrl}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full shadow-sm">
                  <span className="text-rose-600 font-bold">R$ {product.price.toFixed(2)}</span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-1">{product.name}</h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">{product.description}</p>
                <button
                  onClick={() => addToCart(product)}
                  className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-rose-600 transition-colors flex items-center justify-center space-x-2"
                >
                  <Plus className="w-5 h-5" />
                  <span>Adicionar ao Carrinho</span>
                </button>
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
      console.error(error);
      toast.error('Erro ao realizar pedido. Tente novamente.');
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
  const [newProduct, setNewProduct] = useState({ name: '', description: '', price: '', imageUrl: '' });
  const [importUrl, setImportUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);

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
        price: data.price?.toString() || '',
        imageUrl: data.imageUrl || '',
        description: data.description || '',
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
    });

    const unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
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
        createdAt: new Date().toISOString()
      });
      setIsAddingProduct(false);
      setNewProduct({ name: '', description: '', price: '', imageUrl: '' });
      toast.success('Produto adicionado!');
    } catch (error) {
      toast.error('Erro ao adicionar produto.');
    }
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
            toast.error('Erro ao excluir produto.');
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
      toast.error('Erro ao atualizar status.');
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      toast.success("Login realizado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao fazer login:", error);
      if (error.code === 'auth/popup-blocked') {
        toast.error("O pop-up de login foi bloqueado pelo seu navegador. Por favor, permita pop-ups para este site.");
      } else if (error.code === 'auth/cancelled-popup-request') {
        // User closed the popup, no need to show error
      } else {
        toast.error("Erro ao fazer login: " + (error.message || "Tente novamente."));
      }
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <User className="w-16 h-16 text-gray-200 mx-auto mb-6" />
        <h2 className="text-3xl font-bold mb-4">Acesso Restrito</h2>
        <p className="text-gray-600 mb-8">Faça login para gerenciar sua loja.</p>
        <button 
          onClick={handleLogin}
          className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold flex items-center justify-center space-x-3 hover:bg-gray-800 transition-all mb-6"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
          <span>Entrar com Google</span>
        </button>
        <p className="text-xs text-gray-400">
          Dica: Se o login não abrir, tente abrir o site em uma nova aba.
        </p>
      </div>
    );
  }

  if (user.email !== "gustavolangue@outlook.com") {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <XCircle className="w-16 h-16 text-rose-600 mx-auto mb-6" />
        <h2 className="text-3xl font-bold mb-4">Acesso Negado</h2>
        <p className="text-gray-600 mb-8">Você não tem permissão para acessar este painel.</p>
        <button 
          onClick={() => signOut(auth)}
          className="text-rose-600 font-bold hover:underline"
        >
          Sair e tentar com outra conta
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Painel Administrativo</h1>
          <p className="text-gray-500">Bem-vindo, {user.displayName}</p>
        </div>
        <div className="flex items-center space-x-4">
          <button 
            onClick={async () => {
              await seedProducts();
              toast.success('Produtos iniciais adicionados!');
            }}
            className="text-xs text-gray-400 hover:text-gray-600 underline mr-4"
          >
            Adicionar Amostras
          </button>
          <button 
            onClick={() => signOut(auth)}
            className="flex items-center space-x-2 text-gray-500 hover:text-rose-600 font-bold"
          >
            <LogOut className="w-5 h-5" />
            <span>Sair</span>
          </button>
        </div>
      </div>

      <div className="flex space-x-1 bg-gray-100 p-1 rounded-2xl mb-12 w-fit">
        <button 
          onClick={() => setActiveTab('products')}
          className={cn(
            "px-8 py-3 rounded-xl font-bold transition-all",
            activeTab === 'products' ? "bg-white text-rose-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
          )}
        >
          Produtos
        </button>
        <button 
          onClick={() => setActiveTab('orders')}
          className={cn(
            "px-8 py-3 rounded-xl font-bold transition-all",
            activeTab === 'orders' ? "bg-white text-rose-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
          )}
        >
          Pedidos
        </button>
      </div>

      {activeTab === 'products' ? (
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Gerenciar Perfumes</h2>
            <button 
              onClick={() => setIsAddingProduct(true)}
              className="bg-rose-600 text-white px-6 py-3 rounded-xl font-bold flex items-center space-x-2 hover:bg-rose-700 transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>Novo Produto</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map(product => (
              <div key={product.id} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center space-x-4">
                <img src={product.imageUrl} className="w-20 h-20 object-cover rounded-xl" alt={product.name} />
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">{product.name}</h3>
                  <p className="text-rose-600 font-bold">R$ {product.price.toFixed(2)}</p>
                </div>
                <button 
                  onClick={() => handleDeleteProduct(product.id)}
                  className="p-2 text-gray-400 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <h2 className="text-2xl font-bold">Pedidos Recentes</h2>
          <div className="space-y-6">
            {orders.map(order => (
              <div key={order.id} className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                <div className="flex flex-col lg:flex-row justify-between gap-8">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-4">
                      <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Pedido #{order.id.slice(-6)}</span>
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold",
                        order.status === 'pending' && "bg-amber-100 text-amber-700",
                        order.status === 'paid' && "bg-green-100 text-green-700",
                        order.status === 'shipped' && "bg-blue-100 text-blue-700",
                        order.status === 'delivered' && "bg-gray-100 text-gray-700",
                        order.status === 'cancelled' && "bg-rose-100 text-rose-700",
                      )}>
                        {order.status.toUpperCase()}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold mb-2">{order.customerName}</h3>
                    <p className="text-gray-500 text-sm mb-1">{order.email} • {order.phone}</p>
                    <p className="text-gray-500 text-sm mb-6">{order.address}</p>
                    
                    <div className="space-y-2">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="text-sm flex justify-between">
                          <span className="text-gray-600">{item.quantity}x {item.name}</span>
                          <span className="font-bold">R$ {(item.price * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="lg:w-64 flex flex-col justify-between items-end">
                    <div className="text-right">
                      <p className="text-gray-400 text-xs uppercase font-bold mb-1">Total</p>
                      <p className="text-2xl font-extrabold text-gray-900">R$ {order.total.toFixed(2)}</p>
                    </div>
                    
                    <div className="w-full space-y-2">
                      <p className="text-xs font-bold text-gray-400 uppercase">Ações</p>
                      <select 
                        value={order.status}
                        onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value as Order['status'])}
                        className="w-full px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold outline-none focus:ring-2 focus:ring-rose-500"
                      >
                        <option value="pending">Pendente</option>
                        <option value="paid">Pago</option>
                        <option value="shipped">Enviado</option>
                        <option value="delivered">Entregue</option>
                        <option value="cancelled">Cancelado</option>
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
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-gray-100 flex justify-between items-center">
                <h3 className="text-2xl font-bold">Novo Perfume</h3>
                <button onClick={() => setIsAddingProduct(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="px-8 pt-8 space-y-4">
                <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
                  <label className="text-xs font-bold text-rose-600 uppercase tracking-wider mb-2 block">Importar do Boticário</label>
                  <div className="flex gap-2">
                    <input 
                      type="url"
                      placeholder="Cole o link do produto aqui..."
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      className="flex-1 px-4 py-2 rounded-xl border border-rose-200 focus:ring-2 focus:ring-rose-500 outline-none text-sm"
                    />
                    <button 
                      type="button"
                      onClick={handleImportFromUrl}
                      disabled={isImporting}
                      className="bg-rose-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-rose-700 transition-all disabled:opacity-50 flex items-center space-x-2"
                    >
                      {isImporting ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                      <span>{isImporting ? 'Importando...' : 'Importar'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-rose-400 mt-2 italic">
                    * Isso preencherá automaticamente o nome, preço, imagem e descrição.
                  </p>
                </div>
              </div>

              <form onSubmit={handleAddProduct} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Nome do Perfume</label>
                  <input 
                    required
                    type="text"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({...newProduct, name: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">Preço (R$)</label>
                    <input 
                      required
                      type="number"
                      step="0.01"
                      value={newProduct.price}
                      onChange={(e) => setNewProduct({...newProduct, price: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-gray-700">URL da Imagem</label>
                    <input 
                      required
                      type="url"
                      value={newProduct.imageUrl}
                      onChange={(e) => setNewProduct({...newProduct, imageUrl: e.target.value})}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rose-500 outline-none"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-700">Descrição</label>
                  <textarea 
                    required
                    rows={3}
                    value={newProduct.description}
                    onChange={(e) => setNewProduct({...newProduct, description: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-rose-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-rose-700 transition-all"
                >
                  Salvar Produto
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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
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
    <Router>
      <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-rose-100 selection:text-rose-900">
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

        <Toaster position="bottom-right" richColors />
      </div>
    </Router>
  );
}
